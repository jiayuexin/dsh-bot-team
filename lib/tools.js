import { defineTool } from '@deepseek-ai/dsh-tools'
import { delegationDepthOf } from '@deepseek-ai/dsh-subagent'
import { isBotError, errorMessage } from './errors.js'

const RESULT = { type: 'json', description: 'Bot Team result: the operation value, or { code, message } on failure.' }

function render(_args, value) {
  return [{ type: 'text', text: JSON.stringify(value) }]
}

function present(title, kind, rawInput) {
  return { card: 'generic', title, kind, ...rawInput === undefined ? {} : { rawInput } }
}

function failure(code, message) {
  return { code, message }
}

function caught(error) {
  return isBotError(error) ? failure(error.code, error.message) : failure('internal_error', errorMessage(error))
}

/** Run a tool body for a top-level caller; delegated children are refused. */
async function guarded(exec, body) {
  const agent = exec.agent
  if (agent === undefined) return failure('internal_error', 'this tool needs a calling agent')
  if (delegationDepthOf(agent) > 0) return failure('delegated_session', 'subagents cannot use Bot Team tools; ask the parent agent instead')
  try {
    return await body(agent)
  } catch (error) {
    return caught(error)
  }
}

function botView(bot) {
  return { id: bot.id, name: bot.name, title: bot.title, description: bot.description }
}

/**
 * Register every model-facing Bot Team tool. All tools are global so any
 * conversation can reach Bots; Bot-only tools answer `not_a_bot_session`
 * elsewhere.
 */
export function registerTools(ctx, { registry, memory, lifecycle, handoffs }) {
  const selfOrFailure = async (agent, body) => {
    const bot = registry.botBySession(agent.session.id)
    if (bot === undefined) return failure('not_a_bot_session', 'only a Bot conversation can use this tool')
    return body(bot)
  }

  ctx.tools.register(defineTool({
    name: 'bot_list',
    description: 'List the Bot teammates (persistent named agents) and group chats. Use the id or exact name with bot_message.',
    parameters: {},
    output: { schema: RESULT, render },
    execute: (_args, exec) => guarded(exec, async () => ({
      bots: registry.bots().map(botView),
      groups: registry.groups().map((group) => ({ id: group.id, name: group.name, members: group.members })),
    })),
    presentCall: () => present('List Bots', 'read'),
  }))

  ctx.tools.register(defineTool({
    name: 'bot_message',
    description: 'Hand a piece of work to a Bot teammate. The Bot is woken in its own conversation and answers later with bot_reply; its reply arrives here as a new message. Write a self-contained request: the Bot does not see this conversation.',
    parameters: {
      to: { type: 'string', required: true, description: 'Target Bot id (bot-xxxxxxxx) or exact name.' },
      text: { type: 'string', required: true, description: 'The request, with all context the Bot needs.' },
    },
    output: { schema: RESULT, render },
    execute: (args, exec) => guarded(exec, async (agent) => {
      const target = registry.resolveBot(args.to)
      if (target === undefined) return failure('bot_not_found', `no Bot "${args.to}"; call bot_list`)
      if (args.text.trim() === '') return failure('invalid_text', 'text must not be empty')
      const sessionId = agent.session.id
      const handoff = await handoffs.dispatch({ kind: 'message', fromSessionId: sessionId, toBot: target, text: args.text, hop: handoffs.currentHop(sessionId) + 1 })
      return { handoffId: handoff.id, to: target.name, status: 'delivered' }
    }),
    presentCall: (args) => present(`Hand off to ${args.to}`, 'other', args.text),
  }))

  ctx.tools.register(defineTool({
    name: 'bot_reply',
    description: 'Reply to a handoff you received (the message names its handoff_id). The reply is delivered to whoever handed you the work. You may reply more than once, for example progress first and the result later.',
    parameters: {
      handoff_id: { type: 'string', required: true, description: 'The handoff id, handoff-xxxxxxxx.' },
      text: { type: 'string', required: true, description: 'Your reply.' },
    },
    output: { schema: RESULT, render },
    execute: (args, exec) => guarded(exec, async (agent) => {
      if (args.text.trim() === '') return failure('invalid_text', 'text must not be empty')
      return handoffs.reply({ handoffId: args.handoff_id, callerSessionId: agent.session.id, text: args.text })
    }),
    presentCall: (args) => present('Reply to handoff', 'other', args.text),
  }))

  ctx.tools.register(defineTool({
    name: 'bot_create',
    description: 'Create a new persistent Bot teammate when a recurring job deserves its own owner. The new Bot introduces itself in its own conversation.',
    parameters: {
      name: { type: 'string', required: true, description: 'Short unique name without spaces, for example 研究员.' },
      title: { type: 'string', required: true, description: 'Job title.' },
      description: { type: 'string', required: true, description: 'Responsibilities, sources, deliverables and approval boundaries in operational terms.' },
    },
    output: { schema: RESULT, render },
    execute: (args, exec) => guarded(exec, async (agent) => {
      const creator = registry.botBySession(agent.session.id)
      const bot = await lifecycle.createBot({ name: args.name, title: args.title, description: args.description }, creator?.id ?? 'user')
      return botView(bot)
    }),
    presentCall: (args) => present(`Create Bot ${args.name}`, 'other', args.description),
  }))

  ctx.tools.register(defineTool({
    name: 'bot_remember',
    description: 'Update your long-term memory as a Bot. Use add for a stable preference, rule or fact the user asked you to keep; remove to drop one entry; replace to rewrite the whole memory when consolidating.',
    parameters: {
      op: { type: 'string', required: true, enum: ['add', 'remove', 'replace'], description: 'add, remove or replace.' },
      text: { type: 'string', required: true, description: 'The entry (add/remove) or the complete new memory (replace).' },
    },
    output: { schema: RESULT, render },
    execute: (args, exec) => guarded(exec, (agent) => selfOrFailure(agent, async (bot) => {
      const text = await memory.remember(bot.id, args.op, args.text)
      return { memory: text }
    })),
    presentCall: (args) => present('Update memory', 'other', args.text),
  }))

  const triggerView = (trigger) => ({
    id: trigger.id, title: trigger.title, server: trigger.server, tool: trigger.tool, args: trigger.args,
    itemsPath: trigger.itemsPath, idPath: trigger.idPath, match: trigger.match, prompt: trigger.prompt,
    intervalSeconds: trigger.intervalSeconds, enabled: trigger.enabled, lastRunAt: trigger.lastRunAt, lastError: trigger.lastError,
  })
  const ownTrigger = (bot, id) => {
    const trigger = registry.trigger(id)
    return trigger !== undefined && trigger.botId === bot.id ? trigger : undefined
  }

  ctx.tools.register(defineTool({
    name: 'bot_trigger_create',
    description: 'Create an event routine for yourself: the Host polls an MCP tool on an interval without the model, and wakes you only for new items that match. Items are de-duplicated by id; the first poll only records existing items.',
    parameters: {
      title: { type: 'string', required: true, description: 'Routine name.' },
      server: { type: 'string', required: true, description: 'MCP server name, the middle part of mcp__<server>__<tool>.' },
      tool: { type: 'string', required: true, description: 'MCP tool name, the last part of mcp__<server>__<tool>.' },
      args: { type: 'json', description: 'Arguments object passed to the MCP tool on every poll.' },
      items_path: { type: 'string', description: 'Dot path to the list of items in the JSON result; empty when the result itself is the list.' },
      id_path: { type: 'string', required: true, description: 'Dot path, inside one item, to its unique id.' },
      keywords: { type: 'array', items: { type: 'string' }, description: 'Wake only when the item contains any of these (case-insensitive).' },
      regex: { type: 'string', description: 'Wake only when the item JSON matches this regular expression.' },
      prompt: { type: 'string', required: true, description: 'What to do with a matching item.' },
      interval_seconds: { type: 'number', required: true, description: 'Polling interval in seconds, at least 60.' },
    },
    output: { schema: RESULT, render },
    execute: (args, exec) => guarded(exec, (agent) => selfOrFailure(agent, async (bot) => {
      const trigger = await registry.createTrigger({
        botId: bot.id, title: args.title, server: args.server, tool: args.tool, args: args.args ?? {},
        itemsPath: args.items_path ?? '', idPath: args.id_path, prompt: args.prompt,
        intervalSeconds: Math.floor(args.interval_seconds),
        match: { ...args.keywords === undefined ? {} : { keywords: args.keywords }, ...args.regex === undefined ? {} : { regex: args.regex } },
      })
      return triggerView(trigger)
    })),
    presentCall: (args) => present(`Create event routine ${args.title}`, 'other', args.prompt),
  }))

  ctx.tools.register(defineTool({
    name: 'bot_trigger_list',
    description: 'List your event routines.',
    parameters: {},
    output: { schema: RESULT, render },
    execute: (_args, exec) => guarded(exec, (agent) => selfOrFailure(agent, async (bot) => registry.triggersOf(bot.id).map(triggerView))),
    presentCall: () => present('List event routines', 'read'),
  }))

  ctx.tools.register(defineTool({
    name: 'bot_trigger_update',
    description: 'Change one of your event routines; omitted fields keep their values.',
    parameters: {
      id: { type: 'string', required: true, description: 'Routine id, trigger-xxxxxxxx.' },
      title: { type: 'string', description: 'New name.' },
      prompt: { type: 'string', description: 'New instruction.' },
      args: { type: 'json', description: 'New MCP tool arguments object.' },
      keywords: { type: 'array', items: { type: 'string' }, description: 'New keyword filter.' },
      regex: { type: 'string', description: 'New regular expression filter.' },
      interval_seconds: { type: 'number', description: 'New interval, at least 60.' },
      enabled: { type: 'boolean', description: 'Pause (false) or resume (true).' },
    },
    output: { schema: RESULT, render },
    execute: (args, exec) => guarded(exec, (agent) => selfOrFailure(agent, async (bot) => {
      const trigger = ownTrigger(bot, args.id)
      if (trigger === undefined) return failure('trigger_not_found', `you have no routine "${args.id}"`)
      const patch = {}
      if (args.title !== undefined) patch.title = args.title
      if (args.prompt !== undefined) patch.prompt = args.prompt
      if (args.args !== undefined) patch.args = args.args
      if (args.interval_seconds !== undefined) patch.intervalSeconds = Math.floor(args.interval_seconds)
      if (args.enabled !== undefined) patch.enabled = args.enabled
      if (args.keywords !== undefined || args.regex !== undefined) {
        patch.match = { ...trigger.match, ...args.keywords === undefined ? {} : { keywords: args.keywords }, ...args.regex === undefined ? {} : { regex: args.regex } }
      }
      return triggerView(await registry.updateTrigger(trigger.id, patch))
    })),
    presentCall: (args) => present('Update event routine', 'other', args.id),
  }))

  ctx.tools.register(defineTool({
    name: 'bot_trigger_delete',
    description: 'Delete one of your event routines.',
    parameters: { id: { type: 'string', required: true, description: 'Routine id, trigger-xxxxxxxx.' } },
    output: { schema: RESULT, render },
    execute: (args, exec) => guarded(exec, (agent) => selfOrFailure(agent, async (bot) => {
      const trigger = ownTrigger(bot, args.id)
      if (trigger === undefined) return failure('trigger_not_found', `you have no routine "${args.id}"`)
      await registry.removeTrigger(trigger.id)
      return { id: trigger.id, deleted: true }
    })),
    presentCall: (args) => present('Delete event routine', 'other', args.id),
  }))
}
