import { BotError, errorMessage } from './errors.js'
import { botSource, isBotSource } from './deliver.js'
import { createUserMessage } from '@deepseek-ai/dsh-llm'

export const MAX_HOPS = 6

function firstLine(text) {
  return text.split('\n').map((line) => line.trim()).find((line) => line !== '') ?? ''
}

/**
 * The one delivery channel between Sessions. Every handoff is a recorded
 * `Handoff`; replies route back to the recorded origin. Hop counts travel in
 * the message source, and `agent/pre-step` keeps the per-Session current hop.
 */
export class Handoffs {
  constructor({ registry, deliver, logger }) {
    this.registry = registry
    this.deliver = deliver
    this.logger = logger
    this.hops = new Map()
  }

  currentHop(sessionId) {
    return this.hops.get(sessionId) ?? 0
  }

  originLabel(sessionId) {
    if (sessionId === null) return '事件触发'
    const bot = this.registry.botBySession(sessionId)
    if (bot !== undefined) return bot.name
    const group = this.registry.groupBySession(sessionId)
    if (group !== undefined) return `群聊「${group.name}」`
    return '用户'
  }

  /**
   * Hand work to a Bot.
   * @param kind - `message` (tool), `mention` (@Bot) or `event` (trigger).
   * @param fromSessionId - originating Session, or null for events.
   * @param contextSessionId - Session whose snapshot the target should see.
   */
  async dispatch({ kind, fromSessionId, toBot, text, hop, contextSessionId }) {
    if (hop > MAX_HOPS) throw new BotError('handoff_hop_limit', `handoff chains are limited to ${MAX_HOPS} hops`, 409)
    if (fromSessionId !== null && toBot.sessionId === fromSessionId) throw new BotError('self_handoff', 'a Bot cannot hand work to itself')
    const fromBot = fromSessionId === null ? undefined : this.registry.botBySession(fromSessionId)
    const handoff = await this.registry.addHandoff({ kind, fromSessionId, fromBotId: fromBot?.id ?? null, toBotId: toBot.id, hop })
    const label = this.originLabel(fromSessionId)
    const footer = fromSessionId === null
      ? '这是事件触发的任务，没有发起方可回复；请直接在本对话汇报结果。'
      : `处理完后用 bot_reply（handoff_id: ${handoff.id}）把结果回复给${label}。`
    const body = [`【交接 ${handoff.id}】来自${label}：`, '', text.trim(), '', footer].join('\n')
    await this.deliver(toBot.sessionId, body, botSource(`${label} → ${toBot.name}：${firstLine(text)}`, {
      role: 'handoff',
      handoffId: handoff.id,
      fromBotId: handoff.fromBotId,
      hop,
      ...contextSessionId === undefined ? {} : { contextSessionId },
    }))
    return handoff
  }

  async reply({ handoffId, callerSessionId, text }) {
    const handoff = this.registry.handoff(handoffId)
    if (handoff === undefined) throw new BotError('handoff_not_found', `no handoff "${handoffId}"`, 404)
    const bot = this.registry.bot(handoff.toBotId)
    if (bot === undefined || bot.sessionId !== callerSessionId) throw new BotError('not_handoff_target', 'only the Bot that received this handoff can reply to it', 403)
    if (handoff.fromSessionId === null) throw new BotError('no_reply_target', 'this handoff came from an event; report the result in your own conversation', 409)
    const hop = handoff.hop + 1
    if (hop > MAX_HOPS) throw new BotError('handoff_hop_limit', `handoff chains are limited to ${MAX_HOPS} hops`, 409)
    const body = [`【回复 ${handoff.id}】${bot.name}：`, '', text.trim()].join('\n')
    await this.deliver(handoff.fromSessionId, body, botSource(`${bot.name} 回复：${firstLine(text)}`, {
      role: 'reply',
      handoffId: handoff.id,
      fromBotId: bot.id,
      hop,
    }))
    if (handoff.status === 'open') await this.registry.markReplied(handoff.id)
    return { handoffId: handoff.id, deliveredTo: this.originLabel(handoff.fromSessionId) }
  }

  /** Record the hop this step runs at: the highest inbound handoff hop, or 0 after a direct user message. */
  observeStep(sessionId, messages) {
    let highest = -1
    let direct = false
    for (const message of messages) {
      if (isBotSource(message.source) && Number.isSafeInteger(message.source.hop)) highest = Math.max(highest, message.source.hop)
      else if (message.source?.kind === 'user') direct = true
    }
    if (highest >= 0) this.hops.set(sessionId, highest)
    else if (direct) this.hops.set(sessionId, 0)
  }

  /**
   * Place the referenced Session's snapshot right after each inbound handoff
   * that carries `contextSessionId`, using the shipped session-reference service.
   */
  async attachContext(agent, messages, resolver, signal) {
    const out = []
    for (const message of messages) {
      out.push(message)
      const contextSessionId = isBotSource(message.source) ? message.source.contextSessionId : undefined
      if (typeof contextSessionId !== 'string') continue
      if (resolver === undefined) {
        out.push(notice('原对话快照不可用：当前组合未启用 session-reference。'))
        continue
      }
      try {
        const prepared = await resolver.prepare(agent, message.content, [{ sessionId: contextSessionId, label: '发起交接的对话' }], signal)
        if (prepared.additionalContext !== undefined) out.push(prepared.additionalContext)
      } catch (error) {
        if (signal.aborted) throw error
        this.logger.warn('session snapshot for %s failed: %s', contextSessionId, errorMessage(error))
        out.push(notice(`原对话快照读取失败：${errorMessage(error)}`))
      }
    }
    return out
  }
}

export function notice(text) {
  return createUserMessage({ content: [{ type: 'text', text }], source: botSource(text, { role: 'notice' }) })
}
