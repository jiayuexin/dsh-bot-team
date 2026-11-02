import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { MAX_BOTS, HANDOFF_RETENTION_COUNT } from '../lib/registry.js'
import { tempPaths, loadedRegistry } from './fakes.mjs'

const avatar = { shape: 'circle', color: '#112233' }

test('concurrent creates are serialized and all persisted', async (t) => {
  const paths = await tempPaths(t)
  const registry = await loadedRegistry(paths)
  await Promise.all(Array.from({ length: 8 }, (_, i) => registry.createBot({ name: `bot${i}`, avatar, sessionId: `s${i}` })))
  assert.equal(registry.bots().length, 8)
  const reloaded = await loadedRegistry(paths)
  assert.equal(reloaded.bots().length, 8)
  assert.equal(new Set(reloaded.bots().map((bot) => bot.id)).size, 8)
})

test('names are unique case-insensitively and reserved names are refused', async (t) => {
  const registry = await loadedRegistry(await tempPaths(t))
  await registry.createBot({ name: 'Alan', avatar, sessionId: 's1' })
  await assert.rejects(registry.createBot({ name: ' alan ', avatar, sessionId: 's2' }), { code: 'name_taken' })
  await assert.rejects(registry.createBot({ name: 'everyone', avatar, sessionId: 's3' }), { code: 'invalid_name' })
  await assert.rejects(registry.createBot({ name: 'has space', avatar, sessionId: 's4' }), { code: 'invalid_name' })
})

test('the Bot count is capped', async (t) => {
  const registry = await loadedRegistry(await tempPaths(t))
  for (let i = 0; i < MAX_BOTS; i++) await registry.createBot({ name: `b${i}`, avatar, sessionId: `s${i}` })
  assert.throws(() => registry.assertCanCreateBot('one-more'), { code: 'bot_limit_reached' })
})

test('a malformed document fails loudly and is left untouched', async (t) => {
  const paths = await tempPaths(t)
  await mkdir(paths.root, { recursive: true })
  const broken = JSON.stringify({ version: 1, bots: [{ id: 'nope' }], groups: [] })
  await writeFile(paths.bots, broken)
  await assert.rejects(loadedRegistry(paths), { code: 'registry_malformed' })
  assert.equal(await readFile(paths.bots, 'utf8'), broken)
})

test('updates validate fields and keep names unique', async (t) => {
  const registry = await loadedRegistry(await tempPaths(t))
  const a = await registry.createBot({ name: 'A', avatar, sessionId: 's1' })
  await registry.createBot({ name: 'B', avatar, sessionId: 's2' })
  await assert.rejects(registry.updateBot(a.id, { name: 'b' }), { code: 'name_taken' })
  await assert.rejects(registry.updateBot(a.id, { avatar: { color: 'red' } }), { code: 'invalid_field' })
  await assert.rejects(registry.updateBot(a.id, { createdBy: 'x' }), { code: 'invalid_field' })
  const updated = await registry.updateBot(a.id, { pinned: true, title: '  QA  ' })
  assert.equal(updated.pinned, true)
  assert.equal(updated.title, 'QA')
})

test('removing a Bot drops it from every group', async (t) => {
  const registry = await loadedRegistry(await tempPaths(t))
  const [a, b, c] = await Promise.all(['A', 'B', 'C'].map((name, i) => registry.createBot({ name, avatar, sessionId: `s${i}` })))
  const group = await registry.createGroup({ name: 'G', members: [a.id, b.id, c.id], sessionId: 'g1' })
  await registry.removeBot(c.id)
  assert.deepEqual(registry.group(group.id).members, [a.id, b.id])
})

test('groups need two to six existing members', async (t) => {
  const registry = await loadedRegistry(await tempPaths(t))
  const a = await registry.createBot({ name: 'A', avatar, sessionId: 's1' })
  assert.throws(() => registry.assertGroupInput({ name: 'G', members: [a.id] }), { code: 'invalid_members' })
  assert.throws(() => registry.assertGroupInput({ name: 'G', members: [a.id, 'bot-00000000'] }), { code: 'bot_not_found' })
})

test('handoffs are pruned by count', async (t) => {
  const registry = await loadedRegistry(await tempPaths(t))
  for (let i = 0; i < HANDOFF_RETENTION_COUNT + 5; i++) {
    await registry.addHandoff({ kind: 'message', fromSessionId: 's', fromBotId: null, toBotId: 'bot-00000001', hop: 1 })
  }
  assert.equal(registry.state.handoffs.handoffs.length, HANDOFF_RETENTION_COUNT)
})

test('handoffs older than the retention window are pruned', async (t) => {
  let now = 0
  const registry = await loadedRegistry(await tempPaths(t), { now: () => now })
  const old = await registry.addHandoff({ kind: 'message', fromSessionId: 's', fromBotId: null, toBotId: 'bot-00000001', hop: 1 })
  now = 8 * 24 * 60 * 60 * 1000
  await registry.addHandoff({ kind: 'message', fromSessionId: 's', fromBotId: null, toBotId: 'bot-00000001', hop: 1 })
  assert.equal(registry.handoff(old.id), undefined)
})

test('a failed write leaves the in-memory state unchanged', async (t) => {
  const paths = await tempPaths(t)
  const registry = await loadedRegistry(paths)
  registry.files.bots.save = async () => { throw new Error('disk full') }
  await assert.rejects(registry.createBot({ name: 'A', avatar, sessionId: 's1' }), /disk full/)
  assert.equal(registry.bots().length, 0)
})

test('a throwing change listener does not fail a committed write', async (t) => {
  const errors = []
  const registry = await loadedRegistry(await tempPaths(t), { onListenerError: (error) => errors.push(error) })
  registry.onChange(() => { throw new Error('listener boom') })
  const bot = await registry.createBot({ name: 'A', avatar, sessionId: 's1' })
  assert.equal(registry.bot(bot.id).name, 'A')
  assert.equal(errors.length, 1)
})
