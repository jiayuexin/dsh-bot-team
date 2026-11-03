import { randomUUID } from 'node:crypto'
import { BotError, errorMessage } from './errors.js'

export const TICK_MS = 15_000
export const POLL_TIMEOUT_MS = 60_000

/** Read a dot path (`a.b.0.c`) from a JSON value; an empty path returns the value itself. */
export function readPath(value, path) {
  if (path === '') return value
  let current = value
  for (const key of path.split('.')) {
    if (current === null || typeof current !== 'object') return undefined
    current = current[key]
  }
  return current
}

/** The JSON a poll produced: structured content when present, else the text content parsed as JSON. */
export function resultJson(value) {
  if (value?.structuredContent !== undefined) return value.structuredContent
  const text = Array.isArray(value?.content)
    ? value.content.filter((block) => block?.type === 'text').map((block) => block.text).join('')
    : undefined
  if (text === undefined || text.trim() === '') throw new Error('the tool returned no JSON content')
  try {
    return JSON.parse(text)
  } catch {
    throw new Error('the tool result is not JSON')
  }
}

export function itemMatches(trigger, item) {
  const text = JSON.stringify(item)
  const { keywords, regex } = trigger.match
  if (keywords !== undefined && keywords.length > 0) {
    const lower = text.toLocaleLowerCase()
    if (!keywords.some((keyword) => lower.includes(keyword.toLocaleLowerCase()))) return false
  }
  if (regex !== undefined && !new RegExp(regex, 'u').test(text)) return false
  return true
}

/** Split a poll result into new item ids and the new items that match, given what was already seen. */
export function classify(trigger, json) {
  const items = readPath(json, trigger.itemsPath)
  if (!Array.isArray(items)) throw new Error(`items_path "${trigger.itemsPath}" does not point to a list`)
  const entries = items.map((item, index) => {
    const id = readPath(item, trigger.idPath)
    if (id === undefined || id === null || typeof id === 'object') throw new Error(`item ${index} has no scalar id at "${trigger.idPath}"`)
    return { id: String(id), item }
  })
  const seen = new Set(trigger.seenIds)
  const fresh = entries.filter((entry) => !seen.has(entry.id))
  return { ids: entries.map((entry) => entry.id), fresh, matched: fresh.filter((entry) => itemMatches(trigger, entry.item)) }
}

/**
 * Poll enabled event routines from the Host. A poll calls the MCP tool's
 * definition directly, so no model runs unless an item matches.
 */
export class Triggers {
  constructor(ctx, { registry, handoffs }) {
    this.ctx = ctx
    this.registry = registry
    this.handoffs = handoffs
    this.running = new Set()
  }

  start() {
    this.ctx.effect(() => {
      const timer = setInterval(() => this.tick(), TICK_MS)
      return () => clearInterval(timer)
    })
  }

  tick(now = Date.now()) {
    for (const trigger of this.registry.triggers()) {
      if (!trigger.enabled || this.running.has(trigger.id)) continue
      if (trigger.lastRunAt !== null && now - trigger.lastRunAt < trigger.intervalSeconds * 1000) continue
      this.run(trigger.id).catch((error) => this.ctx.logger.warn('trigger %s failed: %s', trigger.id, errorMessage(error)))
    }
  }

  toolName(trigger) {
    return `mcp__${trigger.server}__${trigger.tool}`
  }

  /** Poll one routine now. Resolves with what the poll did; poll failures are recorded on the routine. */
  async run(id) {
    const trigger = this.registry.requireTrigger(id)
    if (this.running.has(id)) throw new BotError('trigger_busy', 'this routine is already polling', 409)
    const bot = this.registry.bot(trigger.botId)
    if (bot === undefined) throw new BotError('bot_not_found', `routine owner ${trigger.botId} no longer exists`, 404)
    this.running.add(id)
    try {
      let result
      try {
        const definition = this.ctx.tools.get(this.toolName(trigger))
        if (definition === undefined) throw new Error(`MCP tool ${this.toolName(trigger)} is not connected`)
        const value = await definition.execute(trigger.args, { signal: AbortSignal.timeout(POLL_TIMEOUT_MS), callId: randomUUID() })
        result = classify(trigger, resultJson(value))
      } catch (error) {
        await this.registry.updateTrigger(id, { lastRunAt: Date.now(), lastError: errorMessage(error) })
        return { ok: false, error: errorMessage(error) }
      }
      if (!trigger.primed) {
        await this.registry.updateTrigger(id, { seenIds: result.ids, primed: true, lastRunAt: Date.now(), lastError: null })
        return { ok: true, primed: true, recorded: result.ids.length, delivered: 0 }
      }
      for (const { id: itemId, item } of result.matched) {
        const text = [trigger.prompt, '', `事件（${trigger.title}，id: ${itemId}）：`, '```json', JSON.stringify(item, null, 2), '```'].join('\n')
        await this.handoffs.send({ kind: 'event', fromSessionId: null, toBot: bot, text })
      }
      await this.registry.updateTrigger(id, {
        seenIds: [...trigger.seenIds, ...result.fresh.map((entry) => entry.id)],
        lastRunAt: Date.now(),
        lastError: null,
      })
      return { ok: true, primed: false, fresh: result.fresh.length, delivered: result.matched.length }
    } finally {
      this.running.delete(id)
    }
  }
}
