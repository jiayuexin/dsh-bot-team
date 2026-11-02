import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { Handoffs, MAX_HOPS } from '../lib/handoff.js'
import { Mentions, formatMention, parseMentions } from '../lib/mention.js'
import { registerIdentity, IDENTITY_SECTION } from '../lib/identity.js'
import { botSource } from '../lib/deliver.js'
import { tempPaths, loadedRegistry, loadedMemory, fakeAgent, recordingDeliver, silentLogger } from './fakes.mjs'

const avatar = { shape: 'circle', color: '#112233' }

async function setup(t) {
  const paths = await tempPaths(t)
  const registry = await loadedRegistry(paths)
  const alan = await registry.createBot({ name: '阿岚', title: '对账专员', avatar, sessionId: 's-alan' })
  const res = await registry.createBot({ name: '研究员', avatar, sessionId: 's-res' })
  const writer = await registry.createBot({ name: '写手', avatar, sessionId: 's-writer' })
  const { deliver, deliveries } = recordingDeliver()
  const handoffs = new Handoffs({ registry, deliver, logger: silentLogger })
  const mentions = new Mentions({ registry, handoffs })
  return { paths, registry, alan, res, writer, deliveries, handoffs, mentions }
}

function userMessage(text) {
  return createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } })
}

test('a handoff is recorded, delivered with structured source, and its reply routes back', async (t) => {
  const { alan, res, deliveries, handoffs, registry } = await setup(t)
  const handoff = await handoffs.dispatch({ kind: 'message', fromSessionId: alan.sessionId, toBot: res, text: '查一下许可证', hop: 1 })
  assert.equal(deliveries[0].sessionId, res.sessionId)
  assert.deepEqual({ ...deliveries[0].source, summary: undefined }, { kind: 'bot-team', form: 'notice', summary: undefined, role: 'handoff', handoffId: handoff.id, fromBotId: alan.id, hop: 1 })
  assert.match(deliveries[0].text, new RegExp(handoff.id))

  await handoffs.reply({ handoffId: handoff.id, callerSessionId: res.sessionId, text: 'MIT' })
  assert.equal(deliveries[1].sessionId, alan.sessionId)
  assert.equal(deliveries[1].source.role, 'reply')
  assert.equal(deliveries[1].source.hop, 2)
  assert.equal(registry.handoff(handoff.id).status, 'replied')
})

test('only the target Bot may reply, and event handoffs have no reply target', async (t) => {
  const { alan, res, writer, handoffs } = await setup(t)
  const handoff = await handoffs.dispatch({ kind: 'message', fromSessionId: alan.sessionId, toBot: res, text: 'x', hop: 1 })
  await assert.rejects(handoffs.reply({ handoffId: handoff.id, callerSessionId: writer.sessionId, text: 'y' }), { code: 'not_handoff_target' })
  const event = await handoffs.dispatch({ kind: 'event', fromSessionId: null, toBot: res, text: 'new issue', hop: 1 })
  await assert.rejects(handoffs.reply({ handoffId: event.id, callerSessionId: res.sessionId, text: 'done' }), { code: 'no_reply_target' })
  await assert.rejects(handoffs.reply({ handoffId: 'handoff-ffffffff', callerSessionId: res.sessionId, text: 'x' }), { code: 'handoff_not_found' })
})

test('self handoffs and hops beyond the limit are refused', async (t) => {
  const { alan, res, handoffs } = await setup(t)
  await assert.rejects(handoffs.dispatch({ kind: 'message', fromSessionId: alan.sessionId, toBot: alan, text: 'x', hop: 1 }), { code: 'self_handoff' })
  await assert.rejects(handoffs.dispatch({ kind: 'message', fromSessionId: alan.sessionId, toBot: res, text: 'x', hop: MAX_HOPS + 1 }), { code: 'handoff_hop_limit' })
})

test('a ping-pong chain stops at the hop limit', async (t) => {
  const { alan, res, handoffs, deliveries } = await setup(t)
  const bots = [alan, res]
  let error
  for (let step = 0; step < 10 && error === undefined; step++) {
    const from = bots[step % 2]
    const to = bots[(step + 1) % 2]
    const inbound = deliveries.filter((d) => d.sessionId === from.sessionId).map((d) => createUserMessage({ content: [{ type: 'text', text: d.text }], source: d.source }))
    handoffs.observeStep(from.sessionId, inbound.slice(-1))
    try {
      await handoffs.dispatch({ kind: 'message', fromSessionId: from.sessionId, toBot: to, text: `ping ${step}`, hop: handoffs.currentHop(from.sessionId) + 1 })
    } catch (caught) {
      error = caught
    }
  }
  assert.equal(error?.code, 'handoff_hop_limit')
  assert.equal(deliveries.length, MAX_HOPS)
})

test('a direct user message resets the hop count', async (t) => {
  const { alan, handoffs } = await setup(t)
  handoffs.observeStep(alan.sessionId, [createUserMessage({ content: [{ type: 'text', text: 'x' }], source: botSource('x', { hop: 4 }) })])
  assert.equal(handoffs.currentHop(alan.sessionId), 4)
  handoffs.observeStep(alan.sessionId, [userMessage('new task')])
  assert.equal(handoffs.currentHop(alan.sessionId), 0)
})

test('mentions parse names with escaped brackets and keep first-appearance order', () => {
  const text = `${formatMention({ id: 'bot-00000002', name: 'b]x' })} and ${formatMention({ id: 'bot-00000001', name: 'a' })} ${formatMention({ id: 'bot-00000002', name: 'b]x' })}`
  const parsed = parseMentions(text)
  assert.deepEqual(parsed.ids, ['bot-00000002', 'bot-00000001'])
  assert.equal(parsed.readable, '@b]x and @a @b]x')
})

test('an @Bot in an ordinary conversation hands off with context and appends one notice, leaving the user message intact', async (t) => {
  const { res, mentions, deliveries } = await setup(t)
  const message = userMessage(`${formatMention(res)} 查一下这个库的许可证`)
  const out = await mentions.process(fakeAgent('s-normal'), [message])
  assert.equal(out[0], message)
  assert.equal(out.length, 2)
  assert.equal(out[1].source.kind, 'bot-team')
  assert.match(out[1].content[0].text, /已转交 @研究员/)
  assert.equal(deliveries.length, 1)
  assert.equal(deliveries[0].sessionId, res.sessionId)
  assert.equal(deliveries[0].source.contextSessionId, 's-normal')
  assert.match(deliveries[0].text, /@研究员 查一下这个库的许可证/)
})

test('plugin-delivered messages are never parsed for mentions', async (t) => {
  const { res, mentions, deliveries } = await setup(t)
  const relayed = createUserMessage({ content: [{ type: 'text', text: formatMention(res) }], source: botSource('relay') })
  const out = await mentions.process(fakeAgent('s-normal'), [relayed])
  assert.equal(out.length, 1)
  assert.equal(deliveries.length, 0)
})

test('in a group only members are addressable and @everyone reaches all of them', async (t) => {
  const { registry, alan, res, writer, mentions, deliveries } = await setup(t)
  const group = await registry.createGroup({ name: 'G', members: [res.id, writer.id], sessionId: 's-group' })
  await mentions.process(fakeAgent(group.sessionId), [userMessage(`${formatMention(alan)} 你不在群里`)])
  assert.equal(deliveries.length, 0)
  await mentions.process(fakeAgent(group.sessionId), [userMessage('@everyone 开会')])
  assert.deepEqual(deliveries.map((d) => d.sessionId).sort(), [res.sessionId, writer.sessionId].sort())
  assert.ok(deliveries.every((d) => d.source.contextSessionId === group.sessionId))
})

test('a context snapshot follows each inbound mention handoff', async (t) => {
  const { handoffs } = await setup(t)
  const inbound = createUserMessage({ content: [{ type: 'text', text: 'task' }], source: botSource('task', { role: 'handoff', hop: 1, contextSessionId: 's-origin' }) })
  const calls = []
  const resolver = {
    async prepare(agent, content, references) {
      calls.push(references)
      return { content, additionalContext: createUserMessage({ content: [{ type: 'text', text: 'snapshot' }], source: { kind: 'session-reference', form: 'recall' } }) }
    },
  }
  const out = await handoffs.attachContext(fakeAgent('s-res'), [inbound], resolver, new AbortController().signal)
  assert.equal(out.length, 2)
  assert.equal(out[1].source.kind, 'session-reference')
  assert.equal(calls[0][0].sessionId, 's-origin')
  const failing = { async prepare() { throw new Error('unreadable') } }
  const degraded = await handoffs.attachContext(fakeAgent('s-res'), [inbound], failing, new AbortController().signal)
  assert.match(degraded[1].content[0].text, /快照读取失败：unreadable/)
})

test('identity text is injected only for Bot and group Sessions', async (t) => {
  const { paths, registry, alan, res } = await setup(t)
  const memory = await loadedMemory(paths, [alan.id])
  await memory.remember(alan.id, 'add', '报表一律用 CSV')
  const sections = []
  registerIdentity({ systemPrompt: { section: (section) => sections.push(section) } }, { registry, memory, paths })
  const [section] = sections
  assert.equal(section.name, IDENTITY_SECTION)
  assert.equal(section.interpolate, false)
  const alanText = section.text({ agent: fakeAgent(alan.sessionId) })
  assert.match(alanText, /你是「阿岚」，岗位：对账专员/)
  assert.match(alanText, /报表一律用 CSV/)
  assert.match(alanText, /研究员/)
  assert.equal(section.text({ agent: fakeAgent('s-normal') }), '')
  assert.equal(section.text({}), '')
  const group = await registry.createGroup({ name: 'G', members: [alan.id, res.id], sessionId: 's-group' })
  assert.match(section.text({ agent: fakeAgent(group.sessionId) }), /群聊「G」的协调者/)
})
