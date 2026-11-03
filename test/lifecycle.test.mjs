import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Lifecycle, BOT_PRESET, BOT_PERMISSION, WORKSPACE_TITLE } from '../lib/lifecycle.js'
import { tempPaths, loadedRegistry, loadedMemory, recordingDeliver } from './fakes.mjs'

function fakeHost({ names = ['workspace-write', BOT_PERMISSION] } = {}) {
  const calls = { creates: [], workspaces: [], presets: [], scheduleDeletes: [] }
  let workspace
  let count = 0
  const sessions = new Map()
  const schedules = new Map()
  const permissionPresets = {
    names,
    set: (session, name) => { calls.presets.push([session.id, name]); session.preset = name },
    current: (session) => session.preset ?? 'workspace-write',
  }
  const schedule = {
    list: async ({ sessionId }) => schedules.get(sessionId) ?? [],
    delete: async ({ sessionId, id }) => { calls.scheduleDeletes.push([sessionId, id]) },
  }
  const ctx = {
    workspaceRegistry: {
      resolveByPath: async () => workspace,
      create: async (path, title) => { calls.workspaces.push([path, title]); workspace = { id: 'ws-1', path }; return workspace },
    },
    sessionController: {
      create: async (request) => { calls.creates.push(request); const id = `session-${++count}`; sessions.set(id, { id }); return { sessionId: id } },
      resolveAgent: async (id) => sessions.has(id) ? { agent: { session: sessions.get(id) } } : { error: new Error('gone') },
    },
    get: (name) => ({ permissionPresets, schedule })[name],
  }
  return { ctx, calls, schedules }
}

async function setup(t, host = fakeHost()) {
  const paths = await tempPaths(t)
  const registry = await loadedRegistry(paths)
  const memory = await loadedMemory(paths)
  const { deliver, deliveries } = recordingDeliver()
  const lifecycle = new Lifecycle(host.ctx, { registry, memory, paths, deliver })
  return { ...host, paths, registry, memory, deliveries, lifecycle }
}

test('creating a Bot registers the shared workspace once, opens a standard Session, grants full access and kicks it off', async (t) => {
  const { lifecycle, calls, deliveries, registry, paths } = await setup(t)
  const bot = await lifecycle.createBot({ name: '阿岚', title: '对账专员', description: '核对流水' })
  await lifecycle.createBot({ name: '研究员' })
  assert.deepEqual(calls.workspaces, [[paths.workspace, WORKSPACE_TITLE]])
  assert.deepEqual(calls.creates[0], { workspaceId: 'ws-1', agentPreset: BOT_PRESET })
  assert.deepEqual(calls.presets[0], [bot.sessionId, BOT_PERMISSION])
  assert.equal(deliveries[0].sessionId, bot.sessionId)
  assert.equal(deliveries[0].source.role, 'kickoff')
  assert.equal(deliveries[0].mode, 'followup')
  assert.match(deliveries[0].text, /自我介绍/)
  assert.equal(registry.bot(bot.id).createdBy, 'user')
})

test('a duplicate name is refused before any Session is created', async (t) => {
  const { lifecycle, calls } = await setup(t)
  await lifecycle.createBot({ name: 'A' })
  await assert.rejects(lifecycle.createBot({ name: 'a' }), { code: 'name_taken' })
  assert.equal(calls.creates.length, 1)
})

test('a Bot created by another Bot records its creator', async (t) => {
  const { lifecycle } = await setup(t)
  const lead = await lifecycle.createBot({ name: 'Lead' })
  const created = await lifecycle.createBot({ name: 'Weekly' }, lead.id)
  assert.equal(created.createdBy, lead.id)
})

test('removing a Bot deletes its routines, triggers and memory', async (t) => {
  const { lifecycle, registry, memory, schedules, calls } = await setup(t)
  const bot = await lifecycle.createBot({ name: 'A' })
  schedules.set(bot.sessionId, [{ id: 'sch-1' }, { id: 'sch-2' }])
  await registry.createTrigger({ botId: bot.id, title: 't', server: 'github', tool: 'list', idPath: 'id', prompt: 'p', intervalSeconds: 60 })
  await memory.remember(bot.id, 'add', 'x')
  await lifecycle.removeBot(bot.id)
  assert.deepEqual(calls.scheduleDeletes, [[bot.sessionId, 'sch-1'], [bot.sessionId, 'sch-2']])
  assert.equal(registry.triggersOf(bot.id).length, 0)
  assert.equal(memory.read(bot.id), '')
  assert.equal(registry.bot(bot.id), undefined)
})

test('re-creating a Session replaces the binding and kicks off again', async (t) => {
  const { lifecycle, registry, deliveries } = await setup(t)
  const bot = await lifecycle.createBot({ name: 'A' })
  const updated = await lifecycle.recreateSession(bot.id)
  assert.notEqual(updated.sessionId, bot.sessionId)
  assert.equal(registry.bot(bot.id).sessionId, updated.sessionId)
  assert.equal(deliveries.at(-1).sessionId, updated.sessionId)
})

test('auto review needs the shipped auto preset and toggles the Bot Session', async (t) => {
  const without = await setup(t)
  const bot = await without.lifecycle.createBot({ name: 'A' })
  await assert.rejects(without.lifecycle.setAutoReview(bot.id, true), { code: 'auto_review_unavailable' })

  const withAuto = await setup(t, fakeHost({ names: ['workspace-write', BOT_PERMISSION, 'auto'] }))
  const other = await withAuto.lifecycle.createBot({ name: 'B' })
  assert.deepEqual(await withAuto.lifecycle.setAutoReview(other.id, true), { available: true, enabled: true })
  assert.deepEqual(await withAuto.lifecycle.setAutoReview(other.id, false), { available: true, enabled: false })
})

test('a group gets its own Session and a kickoff', async (t) => {
  const { lifecycle, deliveries } = await setup(t)
  const a = await lifecycle.createBot({ name: 'A' })
  const b = await lifecycle.createBot({ name: 'B' })
  const group = await lifecycle.createGroup({ name: 'G', members: [a.id, b.id] })
  assert.equal(deliveries.at(-1).sessionId, group.sessionId)
  assert.match(deliveries.at(-1).text, /@everyone/)
})
