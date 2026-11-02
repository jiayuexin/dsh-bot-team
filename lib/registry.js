import { randomBytes } from 'node:crypto'
import { BotError } from './errors.js'
import { JsonFile } from './json-file.js'

export const MAX_BOTS = 50
export const MIN_GROUP_MEMBERS = 2
export const MAX_GROUP_MEMBERS = 6
export const HANDOFF_RETENTION_MS = 7 * 24 * 60 * 60 * 1000
export const HANDOFF_RETENTION_COUNT = 500
export const MAX_SEEN_IDS = 1000
export const MIN_TRIGGER_INTERVAL_SECONDS = 60
export const AVATAR_SHAPES = ['circle', 'square', 'hexagon', 'diamond']
export const RESERVED_NAMES = ['everyone']

const BOT_ID = /^bot-[0-9a-f]{8}$/
const GROUP_ID = /^group-[0-9a-f]{8}$/
const HANDOFF_ID = /^handoff-[0-9a-f]{8}$/
const TRIGGER_ID = /^trigger-[0-9a-f]{8}$/
const COLOR = /^#[0-9a-fA-F]{6}$/

export function newId(prefix) {
  return `${prefix}-${randomBytes(4).toString('hex')}`
}

function fail(where, message) {
  throw new BotError('registry_malformed', `${where}: ${message}`, 500)
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requireString(where, value, { max, allowEmpty = false } = {}) {
  if (typeof value !== 'string') fail(where, 'must be a string')
  if (!allowEmpty && value.trim() === '') fail(where, 'must not be empty')
  if (max !== undefined && value.length > max) fail(where, `must be at most ${max} characters`)
}

export function validateBot(bot, where) {
  if (!isPlainObject(bot)) fail(where, 'must be an object')
  if (typeof bot.id !== 'string' || !BOT_ID.test(bot.id)) fail(`${where}.id`, 'must look like bot-xxxxxxxx')
  requireString(`${where}.name`, bot.name, { max: 32 })
  requireString(`${where}.title`, bot.title, { max: 64, allowEmpty: true })
  requireString(`${where}.description`, bot.description, { max: 2000, allowEmpty: true })
  if (!isPlainObject(bot.avatar)) fail(`${where}.avatar`, 'must be an object')
  if (!AVATAR_SHAPES.includes(bot.avatar.shape)) fail(`${where}.avatar.shape`, `must be one of ${AVATAR_SHAPES.join(', ')}`)
  if (typeof bot.avatar.color !== 'string' || !COLOR.test(bot.avatar.color)) fail(`${where}.avatar.color`, 'must be #rrggbb')
  requireString(`${where}.sessionId`, bot.sessionId)
  if (typeof bot.pinned !== 'boolean') fail(`${where}.pinned`, 'must be a boolean')
  requireString(`${where}.section`, bot.section, { max: 32, allowEmpty: true })
  if (typeof bot.hidden !== 'boolean') fail(`${where}.hidden`, 'must be a boolean')
  if (bot.createdBy !== 'user' && !(typeof bot.createdBy === 'string' && BOT_ID.test(bot.createdBy))) fail(`${where}.createdBy`, 'must be "user" or a bot id')
  if (!Number.isFinite(bot.createdAt)) fail(`${where}.createdAt`, 'must be a number')
}

export function validateGroup(group, where) {
  if (!isPlainObject(group)) fail(where, 'must be an object')
  if (typeof group.id !== 'string' || !GROUP_ID.test(group.id)) fail(`${where}.id`, 'must look like group-xxxxxxxx')
  requireString(`${where}.name`, group.name, { max: 32 })
  if (!Array.isArray(group.members) || group.members.some((id) => typeof id !== 'string' || !BOT_ID.test(id))) fail(`${where}.members`, 'must be a list of bot ids')
  requireString(`${where}.sessionId`, group.sessionId)
  if (!Number.isFinite(group.createdAt)) fail(`${where}.createdAt`, 'must be a number')
}

export function validateHandoff(handoff, where) {
  if (!isPlainObject(handoff)) fail(where, 'must be an object')
  if (typeof handoff.id !== 'string' || !HANDOFF_ID.test(handoff.id)) fail(`${where}.id`, 'must look like handoff-xxxxxxxx')
  if (!['message', 'mention', 'event'].includes(handoff.kind)) fail(`${where}.kind`, 'must be message, mention or event')
  if (handoff.fromSessionId !== null) requireString(`${where}.fromSessionId`, handoff.fromSessionId)
  if (handoff.fromBotId !== null && !(typeof handoff.fromBotId === 'string' && BOT_ID.test(handoff.fromBotId))) fail(`${where}.fromBotId`, 'must be null or a bot id')
  if (typeof handoff.toBotId !== 'string' || !BOT_ID.test(handoff.toBotId)) fail(`${where}.toBotId`, 'must be a bot id')
  if (!Number.isSafeInteger(handoff.hop) || handoff.hop < 1) fail(`${where}.hop`, 'must be a positive integer')
  if (!['open', 'replied'].includes(handoff.status)) fail(`${where}.status`, 'must be open or replied')
  if (!Number.isFinite(handoff.createdAt)) fail(`${where}.createdAt`, 'must be a number')
}

export function validateTrigger(trigger, where) {
  if (!isPlainObject(trigger)) fail(where, 'must be an object')
  if (typeof trigger.id !== 'string' || !TRIGGER_ID.test(trigger.id)) fail(`${where}.id`, 'must look like trigger-xxxxxxxx')
  if (typeof trigger.botId !== 'string' || !BOT_ID.test(trigger.botId)) fail(`${where}.botId`, 'must be a bot id')
  requireString(`${where}.title`, trigger.title, { max: 120 })
  requireString(`${where}.server`, trigger.server, { max: 32 })
  requireString(`${where}.tool`, trigger.tool, { max: 128 })
  if (!isPlainObject(trigger.args)) fail(`${where}.args`, 'must be an object')
  requireString(`${where}.itemsPath`, trigger.itemsPath, { max: 200, allowEmpty: true })
  requireString(`${where}.idPath`, trigger.idPath, { max: 200 })
  if (!isPlainObject(trigger.match)) fail(`${where}.match`, 'must be an object')
  if (trigger.match.keywords !== undefined && (!Array.isArray(trigger.match.keywords) || trigger.match.keywords.some((k) => typeof k !== 'string' || k === ''))) fail(`${where}.match.keywords`, 'must be a list of non-empty strings')
  if (trigger.match.regex !== undefined) {
    requireString(`${where}.match.regex`, trigger.match.regex, { max: 500 })
    try { new RegExp(trigger.match.regex, 'u') } catch { fail(`${where}.match.regex`, 'must be a valid regular expression') }
  }
  requireString(`${where}.prompt`, trigger.prompt, { max: 4000 })
  if (!Number.isSafeInteger(trigger.intervalSeconds) || trigger.intervalSeconds < MIN_TRIGGER_INTERVAL_SECONDS) fail(`${where}.intervalSeconds`, `must be an integer of at least ${MIN_TRIGGER_INTERVAL_SECONDS}`)
  if (!Array.isArray(trigger.seenIds) || trigger.seenIds.some((id) => typeof id !== 'string')) fail(`${where}.seenIds`, 'must be a list of strings')
  if (typeof trigger.primed !== 'boolean') fail(`${where}.primed`, 'must be a boolean')
  if (typeof trigger.enabled !== 'boolean') fail(`${where}.enabled`, 'must be a boolean')
  if (trigger.lastRunAt !== null && !Number.isFinite(trigger.lastRunAt)) fail(`${where}.lastRunAt`, 'must be null or a number')
  if (trigger.lastError !== null && typeof trigger.lastError !== 'string') fail(`${where}.lastError`, 'must be null or a string')
}

function validateList(field, validateItem) {
  return (doc) => {
    if (!isPlainObject(doc) || doc.version !== 1) fail('document', 'must be { "version": 1, ... }')
    if (!Array.isArray(doc[field])) fail(field, 'must be a list')
    doc[field].forEach((item, index) => validateItem(item, `${field}[${index}]`))
  }
}

function validateBotsDoc(doc) {
  validateList('bots', validateBot)(doc)
  if (!Array.isArray(doc.groups)) fail('groups', 'must be a list')
  doc.groups.forEach((group, index) => validateGroup(group, `groups[${index}]`))
}

function normalizedName(name) {
  return name.trim().toLocaleLowerCase()
}

/**
 * The only reader and writer of the plugin's JSON documents. Each document's
 * mutations run one at a time against a draft; the draft replaces the live
 * value only after the file write succeeds.
 */
export class Registry {
  constructor(paths, { now = () => Date.now(), onListenerError = () => {} } = {}) {
    this.now = now
    this.onListenerError = onListenerError
    this.files = {
      bots: new JsonFile(paths.bots, { empty: () => ({ version: 1, bots: [], groups: [] }), validate: validateBotsDoc }),
      handoffs: new JsonFile(paths.handoffs, { empty: () => ({ version: 1, handoffs: [] }), validate: validateList('handoffs', validateHandoff) }),
      triggers: new JsonFile(paths.triggers, { empty: () => ({ version: 1, triggers: [] }), validate: validateList('triggers', validateTrigger) }),
    }
    this.state = undefined
    this.queues = { bots: Promise.resolve(), handoffs: Promise.resolve(), triggers: Promise.resolve() }
    this.listeners = new Set()
  }

  async load() {
    this.state = {
      bots: await this.files.bots.load(),
      handoffs: await this.files.handoffs.load(),
      triggers: await this.files.triggers.load(),
    }
  }

  /** Subscribe to committed changes of any document. */
  onChange(listener) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  mutate(doc, change) {
    const run = this.queues[doc].then(async () => {
      const draft = structuredClone(this.state[doc])
      const result = change(draft)
      await this.files[doc].save(draft)
      this.state[doc] = draft
      for (const listener of this.listeners) {
        try {
          listener(doc)
        } catch (error) {
          this.onListenerError(error)
        }
      }
      return result
    })
    this.queues[doc] = run.catch(() => {})
    return run
  }

  // Bots ---------------------------------------------------------------

  bots() {
    return this.state.bots.bots
  }

  bot(id) {
    return this.bots().find((bot) => bot.id === id)
  }

  requireBot(id) {
    const bot = this.bot(id)
    if (bot === undefined) throw new BotError('bot_not_found', `no Bot with id "${id}"`, 404)
    return bot
  }

  botByName(name) {
    const wanted = normalizedName(name)
    return this.bots().find((bot) => normalizedName(bot.name) === wanted)
  }

  /** Resolve a tool argument that names a Bot by id or by exact name. */
  resolveBot(idOrName) {
    return this.bot(idOrName) ?? this.botByName(idOrName)
  }

  botBySession(sessionId) {
    return this.bots().find((bot) => bot.sessionId === sessionId)
  }

  assertNameAvailable(name, exceptId) {
    const trimmed = name.trim()
    if (trimmed === '') throw new BotError('invalid_name', 'name must not be empty')
    if (trimmed.length > 32) throw new BotError('invalid_name', 'name must be at most 32 characters')
    if (/[\s@\[\]()]/u.test(trimmed)) throw new BotError('invalid_name', 'name must not contain spaces, @, brackets or parentheses')
    if (RESERVED_NAMES.includes(normalizedName(trimmed))) throw new BotError('invalid_name', `"${trimmed}" is reserved`)
    const taken = this.botByName(trimmed)
    if (taken !== undefined && taken.id !== exceptId) throw new BotError('name_taken', `a Bot named "${trimmed}" already exists`, 409)
  }

  assertCanCreateBot(name) {
    if (this.bots().length >= MAX_BOTS) throw new BotError('bot_limit_reached', `at most ${MAX_BOTS} Bots are allowed`, 409)
    this.assertNameAvailable(name)
  }

  async createBot({ name, title = '', description = '', avatar, sessionId, createdBy = 'user' }) {
    this.assertCanCreateBot(name)
    const bot = {
      id: newId('bot'),
      name: name.trim(),
      title: title.trim(),
      description: description.trim(),
      avatar: { shape: avatar?.shape ?? 'circle', color: avatar?.color ?? '#3b6ef5' },
      sessionId,
      pinned: false,
      section: '',
      hidden: false,
      createdBy,
      createdAt: this.now(),
    }
    validateBot(bot, 'bot')
    return this.mutate('bots', (doc) => {
      this.assertCanCreateBot(bot.name)
      doc.bots.push(bot)
      return bot
    })
  }

  async updateBot(id, patch) {
    const allowed = ['name', 'title', 'description', 'avatar', 'pinned', 'section', 'hidden', 'sessionId']
    for (const key of Object.keys(patch)) {
      if (!allowed.includes(key)) throw new BotError('invalid_field', `field "${key}" cannot be updated`)
    }
    if (patch.name !== undefined) this.assertNameAvailable(patch.name, id)
    return this.mutate('bots', (doc) => {
      const index = doc.bots.findIndex((bot) => bot.id === id)
      if (index < 0) throw new BotError('bot_not_found', `no Bot with id "${id}"`, 404)
      const next = { ...doc.bots[index], ...patch }
      for (const key of ['name', 'title', 'description', 'section']) {
        if (typeof next[key] === 'string') next[key] = next[key].trim()
      }
      if (patch.avatar !== undefined) next.avatar = { ...doc.bots[index].avatar, ...patch.avatar }
      try {
        validateBot(next, 'bot')
      } catch (error) {
        throw new BotError('invalid_field', error.message)
      }
      doc.bots[index] = next
      return next
    })
  }

  async removeBot(id) {
    return this.mutate('bots', (doc) => {
      const index = doc.bots.findIndex((bot) => bot.id === id)
      if (index < 0) throw new BotError('bot_not_found', `no Bot with id "${id}"`, 404)
      const [removed] = doc.bots.splice(index, 1)
      for (const group of doc.groups) group.members = group.members.filter((member) => member !== id)
      return removed
    })
  }

  // Groups -------------------------------------------------------------

  groups() {
    return this.state.bots.groups
  }

  group(id) {
    return this.groups().find((group) => group.id === id)
  }

  requireGroup(id) {
    const group = this.group(id)
    if (group === undefined) throw new BotError('group_not_found', `no group with id "${id}"`, 404)
    return group
  }

  groupBySession(sessionId) {
    return this.groups().find((group) => group.sessionId === sessionId)
  }

  assertGroupInput({ name, members }) {
    if (typeof name !== 'string' || name.trim() === '' || name.trim().length > 32) throw new BotError('invalid_name', 'group name must be 1-32 characters')
    if (!Array.isArray(members)) throw new BotError('invalid_members', 'members must be a list of Bot ids')
    const unique = [...new Set(members)]
    if (unique.length < MIN_GROUP_MEMBERS || unique.length > MAX_GROUP_MEMBERS) throw new BotError('invalid_members', `a group needs ${MIN_GROUP_MEMBERS} to ${MAX_GROUP_MEMBERS} Bots`)
    for (const id of unique) this.requireBot(id)
    return unique
  }

  async createGroup({ name, members, sessionId }) {
    const unique = this.assertGroupInput({ name, members })
    const group = { id: newId('group'), name: name.trim(), members: unique, sessionId, createdAt: this.now() }
    validateGroup(group, 'group')
    return this.mutate('bots', (doc) => {
      doc.groups.push(group)
      return group
    })
  }

  async updateGroup(id, patch) {
    const current = this.requireGroup(id)
    const members = this.assertGroupInput({ name: patch.name ?? current.name, members: patch.members ?? current.members })
    return this.mutate('bots', (doc) => {
      const group = doc.groups.find((item) => item.id === id)
      if (group === undefined) throw new BotError('group_not_found', `no group with id "${id}"`, 404)
      group.name = (patch.name ?? group.name).trim()
      group.members = members
      return group
    })
  }

  async removeGroup(id) {
    return this.mutate('bots', (doc) => {
      const index = doc.groups.findIndex((group) => group.id === id)
      if (index < 0) throw new BotError('group_not_found', `no group with id "${id}"`, 404)
      return doc.groups.splice(index, 1)[0]
    })
  }

  // Handoffs -----------------------------------------------------------

  handoff(id) {
    return this.state.handoffs.handoffs.find((handoff) => handoff.id === id)
  }

  async addHandoff({ kind, fromSessionId, fromBotId, toBotId, hop }) {
    const handoff = { id: newId('handoff'), kind, fromSessionId, fromBotId, toBotId, hop, status: 'open', createdAt: this.now() }
    validateHandoff(handoff, 'handoff')
    return this.mutate('handoffs', (doc) => {
      const cutoff = this.now() - HANDOFF_RETENTION_MS
      doc.handoffs = doc.handoffs.filter((item) => item.createdAt >= cutoff)
      doc.handoffs.push(handoff)
      if (doc.handoffs.length > HANDOFF_RETENTION_COUNT) doc.handoffs = doc.handoffs.slice(-HANDOFF_RETENTION_COUNT)
      return handoff
    })
  }

  async markReplied(id) {
    return this.mutate('handoffs', (doc) => {
      const handoff = doc.handoffs.find((item) => item.id === id)
      if (handoff !== undefined) handoff.status = 'replied'
      return handoff
    })
  }

  // Triggers -----------------------------------------------------------

  triggers() {
    return this.state.triggers.triggers
  }

  trigger(id) {
    return this.triggers().find((trigger) => trigger.id === id)
  }

  requireTrigger(id) {
    const trigger = this.trigger(id)
    if (trigger === undefined) throw new BotError('trigger_not_found', `no trigger with id "${id}"`, 404)
    return trigger
  }

  triggersOf(botId) {
    return this.triggers().filter((trigger) => trigger.botId === botId)
  }

  async createTrigger(input) {
    const trigger = {
      id: newId('trigger'),
      botId: input.botId,
      title: input.title,
      server: input.server,
      tool: input.tool,
      args: input.args ?? {},
      itemsPath: input.itemsPath ?? '',
      idPath: input.idPath,
      match: input.match ?? {},
      prompt: input.prompt,
      intervalSeconds: input.intervalSeconds,
      seenIds: [],
      primed: false,
      enabled: true,
      lastRunAt: null,
      lastError: null,
    }
    try {
      validateTrigger(trigger, 'trigger')
    } catch (error) {
      throw new BotError('invalid_trigger', error.message)
    }
    return this.mutate('triggers', (doc) => {
      doc.triggers.push(trigger)
      return trigger
    })
  }

  async updateTrigger(id, patch) {
    return this.mutate('triggers', (doc) => {
      const index = doc.triggers.findIndex((trigger) => trigger.id === id)
      if (index < 0) throw new BotError('trigger_not_found', `no trigger with id "${id}"`, 404)
      const next = { ...doc.triggers[index], ...patch }
      if (next.seenIds.length > MAX_SEEN_IDS) next.seenIds = next.seenIds.slice(-MAX_SEEN_IDS)
      try {
        validateTrigger(next, 'trigger')
      } catch (error) {
        throw new BotError('invalid_trigger', error.message)
      }
      doc.triggers[index] = next
      return next
    })
  }

  async removeTrigger(id) {
    return this.mutate('triggers', (doc) => {
      const index = doc.triggers.findIndex((trigger) => trigger.id === id)
      if (index < 0) throw new BotError('trigger_not_found', `no trigger with id "${id}"`, 404)
      return doc.triggers.splice(index, 1)[0]
    })
  }

  async removeTriggersOf(botId) {
    return this.mutate('triggers', (doc) => {
      doc.triggers = doc.triggers.filter((trigger) => trigger.botId !== botId)
    })
  }
}
