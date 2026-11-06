import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { Handoffs, DEFAULT_MAX_HOPS, resolveMaxHops } from '../lib/handoff.js'
import { Mentions, formatMention, parseMentions } from '../lib/mention.js'
import { registerIdentity, IDENTITY_SECTION } from '../lib/identity.js'
import { botSource } from '../lib/deliver.js'
import { tempPaths, loadedRegistry, loadedMemory, fakeAgent, recordingDeliver, silentLogger } from './fakes.mjs'

const avatar = { shape: 'circle', color: '#112233' }

async function setup(t, options = {}) {
  const paths = await tempPaths(t)
  const registry = await loadedRegistry(paths)
  const alan = await registry.createBot({ name: '阿岚', title: '对账专员', avatar, sessionId: 's-alan' })
  const res = await registry.createBot({ name: '研究员', avatar, sessionId: 's-res' })
  const writer = await registry.createBot({ name: '写手', avatar, sessionId: 's-writer' })
  const { deliver, deliveries } = recordingDeliver()
  const handoffs = new Handoffs({ registry, deliver, logger: silentLogger, ...options })
  const mentions = new Mentions({ registry, handoffs })
  return { paths, registry, alan, res, writer, deliveries, handoffs, mentions }
}

function userMessage(text) {
  return createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } })
}

test('a new task is recorded and queued; its final reply steers back and closes it', async (t) => {
  const { alan, res, deliveries, handoffs, registry } = await setup(t)
  const { handoff, followUp } = await handoffs.send({ kind: 'message', fromSessionId: alan.sessionId, toBot: res, text: '查一下许可证' })
  assert.equal(followUp, false)
  assert.equal(deliveries[0].sessionId, res.sessionId)
  assert.equal(deliveries[0].mode, 'followup')
  assert.deepEqual({ ...deliveries[0].source, summary: undefined }, { kind: 'bot-team', form: 'notice', summary: undefined, role: 'handoff', handoffId: handoff.id, fromBotId: alan.id, hop: 1 })
  assert.match(deliveries[0].text, new RegExp(handoff.id))

  handoffs.observeStep(res.sessionId, [createUserMessage({ content: deliveries[0].content, source: deliveries[0].source })])
  const result = await handoffs.reply({ handoffId: handoff.id, callerSessionId: res.sessionId, text: 'MIT', done: true })
  assert.deepEqual(result, { handoffId: handoff.id, deliveredTo: '阿岚', done: true, files: 0 })
  assert.equal(deliveries[1].sessionId, alan.sessionId)
  assert.equal(deliveries[1].mode, 'steer')
  assert.equal(deliveries[1].source.role, 'reply')
  assert.equal(deliveries[1].source.hop, 2)
  assert.equal(registry.handoff(handoff.id).status, 'replied')
})

test('a second message on an unfinished handoff is a steered follow-up on the same handoff', async (t) => {
  const { alan, res, deliveries, handoffs, registry } = await setup(t)
  const first = await handoffs.send({ kind: 'message', fromSessionId: alan.sessionId, toBot: res, text: '做个报表', contextSessionId: 's-ctx' })
  const second = await handoffs.send({ kind: 'message', fromSessionId: alan.sessionId, toBot: res, text: '好了没？', contextSessionId: 's-ctx' })
  assert.equal(second.followUp, true)
  assert.equal(second.handoff.id, first.handoff.id)
  assert.equal(registry.state.handoffs.handoffs.length, 1)
  assert.equal(deliveries[1].mode, 'steer')
  assert.equal(deliveries[1].source.role, 'follow-up')
  assert.equal(deliveries[1].source.handoffId, first.handoff.id)
  assert.equal(deliveries[1].source.contextSessionId, undefined)
  assert.match(deliveries[1].text, /【跟进 handoff-[0-9a-f]{8}】来自阿岚[\s\S]*好了没？[\s\S]*done: false/)
})

test('progress keeps the handoff open for follow-ups; only done: true closes it', async (t) => {
  const { alan, res, deliveries, handoffs, registry } = await setup(t)
  const { handoff } = await handoffs.send({ kind: 'message', fromSessionId: alan.sessionId, toBot: res, text: '任务' })
  await handoffs.reply({ handoffId: handoff.id, callerSessionId: res.sessionId, text: '做到一半', done: false })
  assert.equal(registry.handoff(handoff.id).status, 'open')
  assert.equal(deliveries[1].source.done, false)
  assert.equal(deliveries[1].mode, 'inject')
  assert.equal((await handoffs.send({ kind: 'message', fromSessionId: alan.sessionId, toBot: res, text: '加急' })).followUp, true)
  await handoffs.reply({ handoffId: handoff.id, callerSessionId: res.sessionId, text: '完成', done: true })
  assert.equal(registry.handoff(handoff.id).status, 'replied')
  assert.equal(deliveries[3].mode, 'steer')
  assert.equal(handoffs.asked.has(handoff.id), false)
  const next = await handoffs.send({ kind: 'message', fromSessionId: alan.sessionId, toBot: res, text: '新任务' })
  assert.equal(next.followUp, false)
  assert.notEqual(next.handoff.id, handoff.id)
  await assert.rejects(handoffs.reply({ handoffId: handoff.id, callerSessionId: res.sessionId, text: 'x', done: 'yes' }), { code: 'invalid_done' })
})

test('plain progress is injected; the answer to a follow-up and a blocker wake the origin', async (t) => {
  const { alan, res, deliveries, handoffs } = await setup(t)
  const { handoff } = await handoffs.send({ kind: 'message', fromSessionId: alan.sessionId, toBot: res, text: '任务' })
  const replyModes = () => deliveries.filter((d) => d.source.role === 'reply').map((d) => d.mode)

  await handoffs.reply({ handoffId: handoff.id, callerSessionId: res.sessionId, text: '做到一半', done: false })
  await handoffs.send({ kind: 'message', fromSessionId: alan.sessionId, toBot: res, text: '好了没？' })
  await handoffs.reply({ handoffId: handoff.id, callerSessionId: res.sessionId, text: '还差一步', done: false })
  await handoffs.reply({ handoffId: handoff.id, callerSessionId: res.sessionId, text: '继续推进', done: false })
  await handoffs.reply({ handoffId: handoff.id, callerSessionId: res.sessionId, text: '要不要覆盖旧文件？', done: false, blocked: true })
  assert.deepEqual(replyModes(), ['inject', 'steer', 'inject', 'steer'])

  const blocker = deliveries.at(-1)
  assert.equal(blocker.source.blocked, true)
  assert.match(blocker.text, /【回复 handoff-[0-9a-f]{8}·阻塞】研究员/)
  assert.match(blocker.source.summary, /^研究员 阻塞：/)
  assert.equal(deliveries.find((d) => d.text.includes('做到一半')).source.blocked, undefined)

  await assert.rejects(handoffs.reply({ handoffId: handoff.id, callerSessionId: res.sessionId, text: 'x', done: false, blocked: 'yes' }), { code: 'invalid_blocked' })
  await assert.rejects(handoffs.reply({ handoffId: handoff.id, callerSessionId: res.sessionId, text: 'x', done: true, blocked: true }), { code: 'invalid_blocked' })
})

test('a follow-up stays pending until its answer is actually delivered', async (t) => {
  const { alan, res, registry } = await setup(t)
  const { deliver, deliveries } = recordingDeliver()
  let failNext = false
  const flaky = async (...args) => {
    if (failNext) { failNext = false; throw new Error('session unavailable') }
    return deliver(...args)
  }
  const handoffs = new Handoffs({ registry, deliver: flaky, logger: silentLogger })
  const { handoff } = await handoffs.send({ kind: 'message', fromSessionId: alan.sessionId, toBot: res, text: '任务' })
  await handoffs.send({ kind: 'message', fromSessionId: alan.sessionId, toBot: res, text: '好了没？' })
  failNext = true
  await assert.rejects(handoffs.reply({ handoffId: handoff.id, callerSessionId: res.sessionId, text: '还差一步', done: false }), /session unavailable/)
  assert.equal(handoffs.asked.has(handoff.id), true)
  await handoffs.reply({ handoffId: handoff.id, callerSessionId: res.sessionId, text: '还差一步', done: false })
  assert.equal(deliveries.at(-1).mode, 'steer')
  assert.equal(handoffs.asked.has(handoff.id), false)
})

test('a new handoff asks for the final delivery and a blocker instead of routine progress', async (t) => {
  const { alan, res, deliveries, handoffs } = await setup(t)
  await handoffs.send({ kind: 'message', fromSessionId: alan.sessionId, toBot: res, text: '任务' })
  assert.match(deliveries[0].text, /done: true）交付[\s\S]*blocked: true[\s\S]*其余进度不必回报/)
})

test('a group coordinator nudging a member through bot_message follows up', async (t) => {
  const { registry, res, writer, handoffs, deliveries } = await setup(t)
  const group = await registry.createGroup({ name: 'G', members: [res.id, writer.id], sessionId: 's-group' })
  await handoffs.send({ kind: 'message', fromSessionId: group.sessionId, toBot: res, text: '查资料' })
  const nudge = await handoffs.send({ kind: 'message', fromSessionId: group.sessionId, toBot: res, text: '用户在催' })
  assert.equal(nudge.followUp, true)
  assert.match(deliveries[1].text, /来自群聊「G」/)
  assert.equal((await handoffs.send({ kind: 'message', fromSessionId: group.sessionId, toBot: writer, text: '写稿' })).followUp, false)
})

test('events always open new handoffs and have no reply target', async (t) => {
  const { alan, res, writer, handoffs, deliveries } = await setup(t)
  const first = await handoffs.send({ kind: 'event', fromSessionId: null, toBot: res, text: 'issue 1' })
  const second = await handoffs.send({ kind: 'event', fromSessionId: null, toBot: res, text: 'issue 2' })
  assert.equal(second.followUp, false)
  assert.notEqual(first.handoff.id, second.handoff.id)
  assert.deepEqual(deliveries.map((d) => [d.mode, d.source.hop]), [['followup', 1], ['followup', 1]])
  await assert.rejects(handoffs.reply({ handoffId: first.handoff.id, callerSessionId: res.sessionId, text: 'done', done: true }), { code: 'no_reply_target' })
  const { handoff } = await handoffs.send({ kind: 'message', fromSessionId: alan.sessionId, toBot: res, text: 'x' })
  await assert.rejects(handoffs.reply({ handoffId: handoff.id, callerSessionId: writer.sessionId, text: 'y', done: true }), { code: 'not_handoff_target' })
  await assert.rejects(handoffs.reply({ handoffId: 'handoff-ffffffff', callerSessionId: res.sessionId, text: 'x', done: true }), { code: 'handoff_not_found' })
})

test('self handoffs, sends and replies beyond the hop limit are refused', async (t) => {
  const { alan, res, handoffs, deliveries } = await setup(t)
  await assert.rejects(handoffs.send({ kind: 'message', fromSessionId: alan.sessionId, toBot: alan, text: 'x' }), { code: 'self_handoff' })
  const { handoff } = await handoffs.send({ kind: 'message', fromSessionId: alan.sessionId, toBot: res, text: 'x' })
  handoffs.observeStep(alan.sessionId, [createUserMessage({ content: [{ type: 'text', text: 'x' }], source: botSource('x', { hop: DEFAULT_MAX_HOPS }) })])
  await assert.rejects(handoffs.send({ kind: 'message', fromSessionId: alan.sessionId, toBot: res, text: 'x' }), { code: 'handoff_hop_limit' })
  handoffs.observeStep(res.sessionId, [createUserMessage({ content: [{ type: 'text', text: 'x' }], source: botSource('x', { hop: DEFAULT_MAX_HOPS }) })])
  await assert.rejects(handoffs.reply({ handoffId: handoff.id, callerSessionId: res.sessionId, text: 'r', done: false }), { code: 'handoff_hop_limit' })
  assert.equal(deliveries.length, 1)
})

test('a ping-pong chain stops at the hop limit even when it turns into follow-ups', async (t) => {
  const { alan, res, handoffs, deliveries } = await setup(t)
  const bots = [alan, res]
  let error
  for (let step = 0; step < DEFAULT_MAX_HOPS + 4 && error === undefined; step++) {
    const from = bots[step % 2]
    const to = bots[(step + 1) % 2]
    const inbound = deliveries.filter((d) => d.sessionId === from.sessionId).map((d) => createUserMessage({ content: d.content, source: d.source }))
    handoffs.observeStep(from.sessionId, inbound.slice(-1))
    try {
      await handoffs.send({ kind: 'message', fromSessionId: from.sessionId, toBot: to, text: `ping ${step}` })
    } catch (caught) {
      error = caught
    }
  }
  assert.equal(error?.code, 'handoff_hop_limit')
  assert.equal(deliveries.length, DEFAULT_MAX_HOPS)
  assert.ok(deliveries.some((d) => d.source.role === 'follow-up'))
})

test('a configured maxHops replaces the default limit', async (t) => {
  const { alan, res, handoffs, deliveries } = await setup(t, { maxHops: 3 })
  handoffs.observeStep(alan.sessionId, [createUserMessage({ content: [{ type: 'text', text: 'x' }], source: botSource('x', { hop: 2 }) })])
  await handoffs.send({ kind: 'message', fromSessionId: alan.sessionId, toBot: res, text: 'third hop' })
  assert.equal(deliveries[0].source.hop, 3)
  handoffs.observeStep(alan.sessionId, [createUserMessage({ content: [{ type: 'text', text: 'x' }], source: botSource('x', { hop: 3 }) })])
  await assert.rejects(handoffs.send({ kind: 'message', fromSessionId: alan.sessionId, toBot: res, text: 'fourth hop' }), { code: 'handoff_hop_limit', message: /limit of 3 hops/ })
})

test('resolveMaxHops defaults when absent and rejects anything but an integer >= 1', () => {
  assert.equal(resolveMaxHops({}), DEFAULT_MAX_HOPS)
  assert.equal(resolveMaxHops(undefined), DEFAULT_MAX_HOPS)
  assert.equal(resolveMaxHops({ maxHops: 30 }), 30)
  for (const maxHops of [0, -1, 2.5, '10', null]) {
    assert.throws(() => resolveMaxHops({ maxHops }), TypeError)
  }
})

test('members discuss several rounds with each other and both still reply to the dispatcher', async (t) => {
  const { alan, res, writer, handoffs, deliveries } = await setup(t)
  const observeLatest = (bot) => {
    const inbound = deliveries.filter((d) => d.sessionId === bot.sessionId).at(-1)
    handoffs.observeStep(bot.sessionId, [createUserMessage({ content: inbound.content, source: inbound.source })])
  }
  const toRes = await handoffs.send({ kind: 'message', fromSessionId: alan.sessionId, toBot: res, text: '调研' })
  const toWriter = await handoffs.send({ kind: 'message', fromSessionId: alan.sessionId, toBot: writer, text: '起草' })
  observeLatest(res)
  const resToWriter = await handoffs.send({ kind: 'message', fromSessionId: res.sessionId, toBot: writer, text: '这是资料' })
  for (let round = 0; round < 3; round++) {
    observeLatest(writer)
    await handoffs.reply({ handoffId: resToWriter.handoff.id, callerSessionId: writer.sessionId, text: `问题 ${round}`, done: false })
    observeLatest(res)
    assert.equal((await handoffs.send({ kind: 'message', fromSessionId: res.sessionId, toBot: writer, text: `回答 ${round}` })).followUp, true)
  }
  observeLatest(writer)
  await handoffs.reply({ handoffId: resToWriter.handoff.id, callerSessionId: writer.sessionId, text: '收到', done: true })
  observeLatest(res)
  await handoffs.reply({ handoffId: toRes.handoff.id, callerSessionId: res.sessionId, text: '调研完成', done: true })
  observeLatest(writer)
  await handoffs.reply({ handoffId: toWriter.handoff.id, callerSessionId: writer.sessionId, text: '初稿完成', done: true })
  const toAlan = deliveries.filter((d) => d.sessionId === alan.sessionId)
  assert.deepEqual(toAlan.map((d) => [d.source.handoffId, d.source.done]), [[toRes.handoff.id, true], [toWriter.handoff.id, true]])
  assert.ok(deliveries.every((d) => d.source.hop <= DEFAULT_MAX_HOPS))
})

test('a direct user message resets the hop count', async (t) => {
  const { alan, handoffs } = await setup(t)
  handoffs.observeStep(alan.sessionId, [createUserMessage({ content: [{ type: 'text', text: 'x' }], source: botSource('x', { hop: 4 }) })])
  assert.equal(handoffs.currentHop(alan.sessionId), 4)
  handoffs.observeStep(alan.sessionId, [userMessage('new task')])
  assert.equal(handoffs.currentHop(alan.sessionId), 0)
})

test('a direct user message resets the hop count even beside injected progress in the same step', async (t) => {
  const { alan, handoffs } = await setup(t)
  const progress = createUserMessage({ content: [{ type: 'text', text: 'p' }], source: botSource('p', { role: 'reply', hop: 15 }) })
  handoffs.observeStep(alan.sessionId, [progress, userMessage('现在什么情况？')])
  assert.equal(handoffs.currentHop(alan.sessionId), 0)
  handoffs.observeStep(alan.sessionId, [progress])
  assert.equal(handoffs.currentHop(alan.sessionId), 15)
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

test('a second @Bot while its handoff is unfinished is relayed as a follow-up', async (t) => {
  const { res, mentions, deliveries } = await setup(t)
  await mentions.process(fakeAgent('s-group-like'), [userMessage(`${formatMention(res)} 做个调研`)])
  const out = await mentions.process(fakeAgent('s-group-like'), [userMessage(`${formatMention(res)} 进度怎么样了`)])
  assert.match(out[1].content[0].text, /已把这条催促或补充转达给 @研究员/)
  assert.equal(deliveries[1].mode, 'steer')
  assert.equal(deliveries[1].source.role, 'follow-up')
  assert.equal(deliveries[1].source.contextSessionId, undefined)
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
  assert.match(alanText, /done: false/)
  assert.match(alanText, /【跟进】/)
  assert.match(alanText, /files/)
  assert.equal(section.text({ agent: fakeAgent('s-normal') }), '')
  assert.equal(section.text({}), '')
  const group = await registry.createGroup({ name: 'G', members: [alan.id, res.id], sessionId: 's-group' })
  assert.match(section.text({ agent: fakeAgent(group.sessionId) }), /群聊「G」的协调者/)
})
