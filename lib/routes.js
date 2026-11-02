import { BotError } from './errors.js'
import { listApps } from './apps.js'
import { registerRoute, requireField } from './http.js'

function pick(input, keys) {
  const out = {}
  for (const key of keys) if (input[key] !== undefined) out[key] = input[key]
  return out
}

/** The Client's only way to read and change Bot Team state. */
export function registerRoutes(ctx, { registry, memory, lifecycle, skills, routines, triggers, paths }) {
  registerRoute(ctx, '/state', {
    GET: async () => ({
      bots: registry.bots(),
      groups: registry.groups(),
      triggers: registry.triggers().map(({ seenIds, ...rest }) => ({ ...rest, seen: seenIds.length })),
      apps: listApps(ctx.tools),
      workspace: paths.workspace,
      autoReviewAvailable: lifecycle.autoReviewAvailable(),
    }),
  })

  registerRoute(ctx, '/bots/create', {
    POST: async (input) => lifecycle.createBot({
      name: requireField(input, 'name'),
      title: typeof input.title === 'string' ? input.title : '',
      description: typeof input.description === 'string' ? input.description : '',
      avatar: input.avatar,
    }),
  })

  registerRoute(ctx, '/bots/update', {
    POST: async (input) => registry.updateBot(requireField(input, 'id'), pick(input, ['name', 'title', 'description', 'avatar', 'pinned', 'section', 'hidden'])),
  })

  registerRoute(ctx, '/bots/remove', { POST: async (input) => lifecycle.removeBot(requireField(input, 'id')) })

  registerRoute(ctx, '/bots/recreate-session', { POST: async (input) => lifecycle.recreateSession(requireField(input, 'id')) })

  registerRoute(ctx, '/bots/memory', {
    GET: async (input) => ({ text: memory.read(registry.requireBot(requireField(input, 'id')).id) }),
    POST: async (input) => {
      const bot = registry.requireBot(requireField(input, 'id'))
      if (typeof input.text !== 'string') throw new BotError('invalid_field', 'text is required')
      return { text: await memory.write(bot.id, input.text) }
    },
  })

  registerRoute(ctx, '/bots/skills', { GET: async (input) => skills.list(requireField(input, 'id')) })

  registerRoute(ctx, '/bots/skills/move', {
    POST: async (input) => skills.move(requireField(input, 'id'), requireField(input, 'dir'), requireField(input, 'to')),
  })

  registerRoute(ctx, '/bots/auto-review', {
    GET: async (input) => lifecycle.autoReview(requireField(input, 'id')),
    POST: async (input) => lifecycle.setAutoReview(requireField(input, 'id'), requireField(input, 'enabled', 'boolean')),
  })

  registerRoute(ctx, '/routines/test', {
    POST: async (input) => routines.testSchedule(requireField(input, 'id'), requireField(input, 'scheduleId')),
  })

  registerRoute(ctx, '/triggers/toggle', {
    POST: async (input) => registry.updateTrigger(registry.requireTrigger(requireField(input, 'id')).id, { enabled: requireField(input, 'enabled', 'boolean') }),
  })

  registerRoute(ctx, '/triggers/test', { POST: async (input) => triggers.run(requireField(input, 'id')) })

  registerRoute(ctx, '/triggers/remove', { POST: async (input) => registry.removeTrigger(requireField(input, 'id')) })

  registerRoute(ctx, '/groups/create', {
    POST: async (input) => lifecycle.createGroup({ name: requireField(input, 'name'), members: input.members }),
  })

  registerRoute(ctx, '/groups/update', {
    POST: async (input) => registry.updateGroup(requireField(input, 'id'), pick(input, ['name', 'members'])),
  })

  registerRoute(ctx, '/groups/remove', { POST: async (input) => lifecycle.removeGroup(requireField(input, 'id')) })
}
