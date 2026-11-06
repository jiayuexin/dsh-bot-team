import { BotError, errorMessage } from './errors.js'
import { botSource, isBotSource, textContent } from './deliver.js'
import { toContentBlocks } from './attachments.js'
import { createUserMessage } from '@deepseek-ai/dsh-llm'

export const DEFAULT_MAX_HOPS = 20

/** Read `maxHops` from the plugin config: absent means the default, anything but an integer >= 1 is rejected. */
export function resolveMaxHops(config) {
  const value = config?.maxHops
  if (value === undefined) return DEFAULT_MAX_HOPS
  if (!Number.isSafeInteger(value) || value < 1) throw new TypeError(`dsh-bot-team: maxHops must be an integer >= 1, got ${JSON.stringify(value)}`)
  return value
}

function firstLine(text) {
  return text.split('\n').map((line) => line.trim()).find((line) => line !== '') ?? ''
}

/**
 * The one delivery channel between Sessions. A new task is a recorded
 * `Handoff` queued behind the target's current turn; a follow-up on an
 * unfinished handoff steers into the target's next step. Replies go back to
 * the recorded origin: final deliveries, blockers and the answer to a
 * follow-up wake it, plain progress is injected without waking it. Every
 * delivery runs at `currentHop(sender) + 1`.
 */
export class Handoffs {
  constructor({ registry, deliver, logger, attachments = () => undefined, workspace, maxHops = DEFAULT_MAX_HOPS }) {
    this.registry = registry
    this.maxHops = maxHops
    this.deliver = deliver
    this.logger = logger
    this.attachments = attachments
    this.workspace = workspace
    this.hops = new Map()
    /** Handoffs whose origin sent a follow-up that the target has not answered yet; in memory only. */
    this.asked = new Set()
  }

  currentHop(sessionId) {
    return sessionId === null ? 0 : this.hops.get(sessionId) ?? 0
  }

  nextHop(sessionId) {
    const hop = this.currentHop(sessionId) + 1
    if (hop > this.maxHops) {
      throw new BotError('handoff_hop_limit', `this handoff chain reached the limit of ${this.maxHops} hops, so nothing was sent; tell the user, who can continue it by sending a message directly in this conversation`, 409)
    }
    return hop
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
   * Hand work to a Bot: the only entry for `bot_message`, `@Bot` and event routines.
   * @param kind - `message` (tool), `mention` (@Bot) or `event` (trigger).
   * @param fromSessionId - originating Session, or null for events.
   * @param contextSessionId - Session whose snapshot a new task carries.
   * @returns the handoff and whether the delivery followed up an unfinished one.
   */
  async send({ kind, fromSessionId, toBot, text, contextSessionId }) {
    if (fromSessionId !== null && toBot.sessionId === fromSessionId) throw new BotError('self_handoff', 'a Bot cannot hand work to itself')
    const hop = this.nextHop(fromSessionId)
    const open = fromSessionId === null ? undefined : this.registry.openHandoff(fromSessionId, toBot.id)
    if (open !== undefined) return { handoff: await this.followUp({ handoff: open, toBot, text, hop }), followUp: true }
    return { handoff: await this.dispatch({ kind, fromSessionId, toBot, text, hop, contextSessionId }), followUp: false }
  }

  async dispatch({ kind, fromSessionId, toBot, text, hop, contextSessionId }) {
    const fromBot = fromSessionId === null ? undefined : this.registry.botBySession(fromSessionId)
    const handoff = await this.registry.addHandoff({ kind, fromSessionId, fromBotId: fromBot?.id ?? null, toBotId: toBot.id, hop })
    const label = this.originLabel(fromSessionId)
    const footer = fromSessionId === null
      ? '这是事件触发的任务，没有发起方可回复；请直接在本对话汇报结果。'
      : `完成后用 bot_reply（handoff_id: ${handoff.id}，done: true）交付，产物文件放进 files；遇到阻塞需要发起方决定时用 done: false、blocked: true；其余进度不必回报。`
    const body = [`【交接 ${handoff.id}】来自${label}：`, '', text.trim(), '', footer].join('\n')
    await this.deliver(toBot.sessionId, textContent(body), botSource(`${label} → ${toBot.name}：${firstLine(text)}`, {
      role: 'handoff',
      handoffId: handoff.id,
      fromBotId: handoff.fromBotId,
      hop,
      ...contextSessionId === undefined ? {} : { contextSessionId },
    }), 'followup')
    return handoff
  }

  /** Steer a nudge or addition on an unfinished handoff into the target's next step; no new record, no snapshot. */
  async followUp({ handoff, toBot, text, hop }) {
    const label = this.originLabel(handoff.fromSessionId)
    const body = [
      `【跟进 ${handoff.id}】来自${label}：`, '', text.trim(), '',
      `这是对交接 ${handoff.id} 的跟进（催促或补充）：先用 bot_reply（handoff_id: ${handoff.id}，done: false）回一两句当前进度，然后继续原任务。`,
      `如果内容其实是一项新的独立工作，就在原任务之后接着做，进度和结果同样用这个 handoff_id 回复；全部完成才用 done: true。`,
    ].join('\n')
    await this.deliver(toBot.sessionId, textContent(body), botSource(`${label} → ${toBot.name}（跟进）：${firstLine(text)}`, {
      role: 'follow-up',
      handoffId: handoff.id,
      fromBotId: handoff.fromBotId,
      hop,
    }), 'steer')
    this.asked.add(handoff.id)
    return handoff
  }

  /**
   * Reply on a handoff. Progress (`done: false`) keeps it open for further
   * follow-ups; the final delivery (`done: true`) closes it. Files are stored
   * as attachments first, so a failing file sends nothing.
   */
  async reply({ handoffId, callerSessionId, text, done, blocked = false, files, signal }) {
    if (typeof done !== 'boolean') throw new BotError('invalid_done', 'done must be true or false')
    if (typeof blocked !== 'boolean') throw new BotError('invalid_blocked', 'blocked must be true or false')
    if (done && blocked) throw new BotError('invalid_blocked', 'a final delivery (done: true) cannot be blocked')
    const handoff = this.registry.handoff(handoffId)
    if (handoff === undefined) throw new BotError('handoff_not_found', `no handoff "${handoffId}"`, 404)
    const bot = this.registry.bot(handoff.toBotId)
    if (bot === undefined || bot.sessionId !== callerSessionId) throw new BotError('not_handoff_target', 'only the Bot that received this handoff can reply to it', 403)
    if (handoff.fromSessionId === null) throw new BotError('no_reply_target', 'this handoff came from an event; report the result in your own conversation', 409)
    const hop = this.nextHop(callerSessionId)
    const { blocks, listing } = await toContentBlocks(files, { attachments: this.attachments(), workspace: this.workspace, signal })
    const kind = done ? '回复' : blocked ? '阻塞' : '进度'
    const lines = [`【回复 ${handoff.id}${done ? '' : `·${kind}`}】${bot.name}：`, '', text.trim()]
    if (listing.length > 0) {
      lines.push('', '产物：', ...listing.map((item) => `- ${item.name}${item.description === '' ? '' : `：${item.description}`}（${item.path}）`))
    }
    const suffix = listing.length > 0 ? `（附 ${listing.length} 个文件）` : ''
    const mode = done || blocked || this.asked.has(handoff.id) ? 'steer' : 'inject'
    await this.deliver(handoff.fromSessionId, [...textContent(lines.join('\n')), ...blocks], botSource(`${bot.name} ${kind}：${firstLine(text)}${suffix}`, {
      role: 'reply',
      handoffId: handoff.id,
      fromBotId: bot.id,
      hop,
      done,
      ...blocked ? { blocked } : {},
    }), mode)
    this.asked.delete(handoff.id)
    if (done && handoff.status === 'open') await this.registry.markReplied(handoff.id)
    return { handoffId: handoff.id, deliveredTo: this.originLabel(handoff.fromSessionId), done, files: listing.length }
  }

  /**
   * Record the hop this step runs at: 0 when the step carries a direct user
   * message, even beside injected progress, else the highest inbound handoff hop.
   */
  observeStep(sessionId, messages) {
    let highest = -1
    let direct = false
    for (const message of messages) {
      if (isBotSource(message.source) && Number.isSafeInteger(message.source.hop)) highest = Math.max(highest, message.source.hop)
      else if (message.source?.kind === 'user') direct = true
    }
    if (direct) this.hops.set(sessionId, 0)
    else if (highest >= 0) this.hops.set(sessionId, highest)
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
  return createUserMessage({ content: textContent(text), source: botSource(text, { role: 'notice' }) })
}
