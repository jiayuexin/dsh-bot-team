import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { BotError, errorMessage } from './errors.js'

/** Producer kind of every message this plugin puts into a Session. */
export const SOURCE_KIND = 'bot-team'
const SUMMARY_LIMIT = 120

export function boundSummary(text) {
  const line = text.replace(/\s+/g, ' ').trim()
  return line.length <= SUMMARY_LIMIT ? line : `${line.slice(0, SUMMARY_LIMIT - 1)}…`
}

/**
 * Message source for plugin-produced context. `notice` renders as a collapsed
 * one-line row in Chat; the extra fields are structured data the Host reads
 * back in `agent/pre-step` (role, handoff identity, hop count).
 */
export function botSource(summary, fields = {}) {
  return { kind: SOURCE_KIND, form: 'notice', summary: boundSummary(summary), ...fields }
}

export function isBotSource(source) {
  return source?.kind === SOURCE_KIND
}

export function textContent(text) {
  return [{ type: 'text', text }]
}

/**
 * `followup` queues a new turn behind a busy agent; `steer` reaches a busy
 * agent at its next step boundary. Both start a turn on an idle agent.
 * `inject` never wakes the agent: the message is read at its next step,
 * whenever something else starts one.
 */
export const DELIVERY_MODES = ['followup', 'steer', 'inject']

/**
 * Put a message into a Session's inbox and wake its agent, resuming a cold
 * Session first. Resolves once the Session has persisted the message.
 */
export function createDeliverer(ctx) {
  return async function deliver(sessionId, content, source, mode) {
    if (!DELIVERY_MODES.includes(mode)) throw new TypeError(`deliver: mode must be one of ${DELIVERY_MODES.join(', ')}, got ${String(mode)}`)
    const resolved = await ctx.sessionController.resolveAgent(sessionId)
    if ('error' in resolved) {
      throw new BotError('session_unavailable', `session "${sessionId}" cannot be resumed: ${errorMessage(resolved.error)}`, 409)
    }
    const message = createUserMessage({ content, source })
    resolved.agent[mode](message)
    if (!await ctx.sessions.flush(resolved.agent.session)) {
      throw new BotError('delivery_not_persisted', `session "${sessionId}" did not persist the message`, 500)
    }
    return message.id
  }
}
