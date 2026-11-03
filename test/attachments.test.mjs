import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, truncate, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { toContentBlocks, MAX_FILE_BYTES, MAX_FILES } from '../lib/attachments.js'
import { Handoffs } from '../lib/handoff.js'
import { registerTools } from '../lib/tools.js'
import { tempPaths, loadedRegistry, loadedMemory, recordingDeliver, silentLogger } from './fakes.mjs'

class FakeAttachmentError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

/** The slice of ctx.attachments the reply path uses; streams are consumed like the real service. */
function fakeAttachments() {
  const saved = []
  return {
    saved,
    async saveImage({ data, mediaType, name }) {
      if (name.startsWith('huge')) throw new FakeAttachmentError('IMAGE_TOO_LARGE', 'image exceeds the limit')
      saved.push({ kind: 'image', name, mediaType, bytes: data.byteLength })
      return { attachmentId: `sha256:image-${saved.length}`, mediaType, name }
    },
    async saveFileStream({ data, name }) {
      let bytes = 0
      for await (const chunk of data) bytes += chunk.byteLength
      saved.push({ kind: 'file', name, bytes })
      return { attachmentId: `sha256:file-${saved.length}`, name, bytes }
    },
    isAttachmentError: (error) => error instanceof FakeAttachmentError,
  }
}

async function workspaceWithFiles(t) {
  const paths = await tempPaths(t)
  await mkdir(join(paths.workspace, 'out'), { recursive: true })
  await writeFile(join(paths.workspace, 'out', 'chart.PNG'), Buffer.from([1, 2, 3]))
  await writeFile(join(paths.workspace, 'report.md'), '# report\n')
  await writeFile(join(paths.workspace, 'huge.png'), Buffer.from([0]))
  return paths
}

test('images become image blocks and other files stream into file blocks, in order', async (t) => {
  const paths = await workspaceWithFiles(t)
  const attachments = fakeAttachments()
  const { blocks, listing } = await toContentBlocks([
    { path: 'out/chart.PNG', description: '趋势图' },
    { path: join(paths.workspace, 'report.md') },
  ], { attachments, workspace: paths.workspace })
  assert.deepEqual(blocks.map((block) => block.type), ['image', 'file'])
  assert.deepEqual(attachments.saved, [
    { kind: 'image', name: 'chart.PNG', mediaType: 'image/png', bytes: 3 },
    { kind: 'file', name: 'report.md', bytes: 9 },
  ])
  assert.deepEqual(listing.map((item) => [item.name, item.description, item.kind]), [['chart.PNG', '趋势图', 'image'], ['report.md', '', 'file']])
})

test('no files need no attachment service', async () => {
  assert.deepEqual(await toContentBlocks(undefined, { attachments: undefined, workspace: '/x' }), { blocks: [], listing: [] })
  assert.deepEqual(await toContentBlocks([], { attachments: undefined, workspace: '/x' }), { blocks: [], listing: [] })
})

test('invalid files are refused before anything is stored', async (t) => {
  const paths = await workspaceWithFiles(t)
  const attachments = fakeAttachments()
  const workspace = paths.workspace
  await assert.rejects(toContentBlocks([{ path: 'report.md' }], { attachments: undefined, workspace }), { code: 'attachments_unavailable' })
  await assert.rejects(toContentBlocks([{ path: 'report.md' }, { path: 'missing.txt' }], { attachments, workspace }), { code: 'file_not_found' })
  await assert.rejects(toContentBlocks([{ path: 'out' }], { attachments, workspace }), { code: 'file_not_found' })
  await assert.rejects(toContentBlocks(Array.from({ length: MAX_FILES + 1 }, () => ({ path: 'report.md' })), { attachments, workspace }), { code: 'too_many_files' })
  await writeFile(join(workspace, 'big.zip'), '')
  await truncate(join(workspace, 'big.zip'), MAX_FILE_BYTES + 1)
  await assert.rejects(toContentBlocks([{ path: 'big.zip' }], { attachments, workspace }), { code: 'file_too_large' })
  await writeFile(join(workspace, 'big.png'), '')
  await truncate(join(workspace, 'big.png'), MAX_FILE_BYTES + 1)
  await assert.rejects(toContentBlocks([{ path: 'big.png' }], { attachments, workspace }), { code: 'file_too_large' })
  assert.equal(attachments.saved.length, 0)
})

test('an attachment-service rejection keeps its own error code', async (t) => {
  const paths = await workspaceWithFiles(t)
  await assert.rejects(toContentBlocks([{ path: 'huge.png' }], { attachments: fakeAttachments(), workspace: paths.workspace }), { code: 'IMAGE_TOO_LARGE' })
})

async function replySetup(t) {
  const paths = await workspaceWithFiles(t)
  const registry = await loadedRegistry(paths)
  const lead = await registry.createBot({ name: '组长', avatar: { shape: 'circle', color: '#112233' }, sessionId: 's-lead' })
  const designer = await registry.createBot({ name: '设计', avatar: { shape: 'circle', color: '#112233' }, sessionId: 's-design' })
  const { deliver, deliveries } = recordingDeliver()
  const attachments = fakeAttachments()
  const handoffs = new Handoffs({ registry, deliver, logger: silentLogger, attachments: () => attachments, workspace: paths.workspace })
  const { handoff } = await handoffs.send({ kind: 'message', fromSessionId: lead.sessionId, toBot: designer, text: '出一张图' })
  return { paths, registry, designer, handoffs, deliveries, handoff }
}

test('a reply carries its files after the text, listed by name', async (t) => {
  const { designer, handoffs, deliveries, handoff } = await replySetup(t)
  const result = await handoffs.reply({ handoffId: handoff.id, callerSessionId: designer.sessionId, text: '图做好了', done: true, files: [{ path: 'out/chart.PNG', description: '主视觉' }, { path: 'report.md' }] })
  assert.equal(result.files, 2)
  const reply = deliveries.at(-1)
  assert.deepEqual(reply.content.map((block) => block.type), ['text', 'image', 'file'])
  assert.match(reply.text, /产物：\n- chart\.PNG：主视觉（.+chart\.PNG）\n- report\.md（.+report\.md）/)
  assert.match(reply.source.summary, /（附 2 个文件）/)
})

test('a reply with a failing file sends nothing and leaves the handoff open', async (t) => {
  const { designer, handoffs, deliveries, handoff, registry } = await replySetup(t)
  await assert.rejects(handoffs.reply({ handoffId: handoff.id, callerSessionId: designer.sessionId, text: '好了', done: true, files: [{ path: 'missing.png' }] }), { code: 'file_not_found' })
  assert.equal(deliveries.length, 1)
  assert.equal(registry.handoff(handoff.id).status, 'open')
})

test('bot_reply requires done and accepts a typed files list', async (t) => {
  const paths = await tempPaths(t)
  const registry = await loadedRegistry(paths)
  const tools = new Map()
  const handoffs = new Handoffs({ registry, deliver: recordingDeliver().deliver, logger: silentLogger })
  registerTools({ tools: { register: (definition) => tools.set(definition.name, definition) } }, { registry, memory: await loadedMemory(paths), lifecycle: {}, handoffs })
  const schema = tools.get('bot_reply').parameters
  assert.deepEqual(schema.required, ['handoff_id', 'text', 'done'])
  assert.equal(schema.properties.done.type, 'boolean')
  assert.deepEqual(schema.properties.files.items.required, ['path'])
  assert.equal(schema.properties.files.items.additionalProperties, false)
})
