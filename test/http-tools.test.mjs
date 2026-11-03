import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isTrustedRequest } from '../lib/http.js'
import { registerTools } from '../lib/tools.js'
import { Handoffs } from '../lib/handoff.js'
import { tempPaths, loadedRegistry, loadedMemory, fakeAgent, recordingDeliver, silentLogger } from './fakes.mjs'

const ok = { host: '127.0.0.1:4799', 'x-dsh-bot-team': '1' }

test('the trust fence follows the /api rule plus the custom header', () => {
  assert.equal(isTrustedRequest(ok), true)
  assert.equal(isTrustedRequest({ ...ok, origin: 'http://127.0.0.1:4799', 'sec-fetch-site': 'same-origin' }), true)
  assert.equal(isTrustedRequest({ host: '127.0.0.1:4799' }), false)
  assert.equal(isTrustedRequest({ ...ok, origin: 'http://evil.example' }), false)
  assert.equal(isTrustedRequest({ ...ok, origin: 'http://127.0.0.1:9999' }), false)
  assert.equal(isTrustedRequest({ ...ok, origin: 'null' }), false)
  assert.equal(isTrustedRequest({ ...ok, 'sec-fetch-site': 'cross-site' }), false)
  assert.equal(isTrustedRequest({ ...ok, host: 'attacker.example:4799' }), false)
  assert.equal(isTrustedRequest({ ...ok, host: 'localhost:4799', origin: 'http://localhost:4799' }), true)
})

async function setup(t) {
  const paths = await tempPaths(t)
  const registry = await loadedRegistry(paths)
  const memory = await loadedMemory(paths)
  const a = await registry.createBot({ name: 'A', avatar: { shape: 'circle', color: '#112233' }, sessionId: 's-a' })
  const b = await registry.createBot({ name: 'B', avatar: { shape: 'circle', color: '#112233' }, sessionId: 's-b' })
  const { deliver, deliveries } = recordingDeliver()
  const handoffs = new Handoffs({ registry, deliver, logger: silentLogger })
  const tools = new Map()
  const lifecycle = { createBot: async () => { throw new Error('unused') } }
  registerTools({ tools: { register: (definition) => tools.set(definition.name, definition) } }, { registry, memory, lifecycle, handoffs })
  const call = (name, args, agent) => tools.get(name).execute(args, { agent, signal: new AbortController().signal, callId: 'c1' })
  return { registry, memory, tools, call, a, b, deliveries }
}

test('every Bot tool is defined with the real defineTool', async (t) => {
  const { tools } = await setup(t)
  assert.deepEqual([...tools.keys()].sort(), ['bot_create', 'bot_list', 'bot_message', 'bot_remember', 'bot_reply', 'bot_trigger_create', 'bot_trigger_delete', 'bot_trigger_list', 'bot_trigger_update'])
})

test('a subagent cannot hand off or create Bots', async (t) => {
  const { call, deliveries } = await setup(t)
  const child = fakeAgent('s-child', { delegationDepth: 1 })
  assert.equal((await call('bot_message', { to: 'B', text: 'x' }, child)).code, 'delegated_session')
  assert.equal((await call('bot_create', { name: 'C', title: 't', description: 'd' }, child)).code, 'delegated_session')
  assert.equal(deliveries.length, 0)
})

test('bot_remember and bot_trigger_* answer not_a_bot_session outside a Bot conversation', async (t) => {
  const { call } = await setup(t)
  const normal = fakeAgent('s-normal')
  assert.equal((await call('bot_remember', { op: 'add', text: 'x' }, normal)).code, 'not_a_bot_session')
  assert.equal((await call('bot_trigger_list', {}, normal)).code, 'not_a_bot_session')
})

test('bot_message resolves names, refuses unknown targets and delivers', async (t) => {
  const { call, deliveries, b } = await setup(t)
  assert.equal((await call('bot_message', { to: 'Nobody', text: 'x' }, fakeAgent('s-a'))).code, 'bot_not_found')
  const result = await call('bot_message', { to: 'b', text: '帮我查一下' }, fakeAgent('s-a'))
  assert.equal(result.status, 'delivered')
  assert.equal(result.followUp, false)
  assert.equal(deliveries[0].sessionId, b.sessionId)
  const nudge = await call('bot_message', { to: 'B', text: '好了吗' }, fakeAgent('s-a'))
  assert.equal(nudge.followUp, true)
  assert.equal(nudge.handoffId, result.handoffId)
  assert.equal(deliveries[1].mode, 'steer')
  assert.equal((await call('bot_message', { to: 'A', text: 'x' }, fakeAgent('s-a'))).code, 'self_handoff')
})

test('a Bot only manages its own triggers', async (t) => {
  const { call, registry, a } = await setup(t)
  const created = await call('bot_trigger_create', { title: 't', server: 'github', tool: 'n', id_path: 'id', prompt: 'p', interval_seconds: 120 }, fakeAgent('s-a'))
  assert.equal(registry.trigger(created.id).botId, a.id)
  assert.equal((await call('bot_trigger_delete', { id: created.id }, fakeAgent('s-b'))).code, 'trigger_not_found')
  assert.equal((await call('bot_trigger_update', { id: created.id, enabled: false }, fakeAgent('s-a'))).enabled, false)
})
