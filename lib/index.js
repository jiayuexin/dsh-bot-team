import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { botTeamPaths } from './paths.js'
import { Registry } from './registry.js'
import { MemoryStore } from './memory.js'
import { createDeliverer } from './deliver.js'
import { registerIdentity } from './identity.js'
import { Lifecycle } from './lifecycle.js'
import { Handoffs } from './handoff.js'
import { Mentions } from './mention.js'
import { BotSkills } from './skills.js'
import { Routines } from './routines.js'
import { Triggers } from './triggers.js'
import { registerTools } from './tools.js'
import { registerRoutes } from './routes.js'

export const name = 'dsh-bot-team'

/** Optional services (`schedule`, `permissionPresets`, `sessionReferenceResolver`, `skills`) are read with `ctx.get`. */
export const inject = ['webServer', 'tools', 'systemPrompt', 'sessionController', 'sessions', 'workspaceRegistry', 'agents']

export async function apply(ctx) {
  const paths = botTeamPaths(resolveDshHome())
  const registry = new Registry(paths, { onListenerError: (error) => ctx.logger.warn('registry listener failed: %s', error.message) })
  await registry.load()
  const memory = new MemoryStore(paths)
  await memory.load(registry.bots().map((bot) => bot.id))

  const deliver = createDeliverer(ctx)
  const lifecycle = new Lifecycle(ctx, { registry, memory, paths, deliver })
  const handoffs = new Handoffs({ registry, deliver, logger: ctx.logger })
  const mentions = new Mentions({ registry, handoffs })
  const skills = new BotSkills(ctx, { registry, paths })
  const routines = new Routines(ctx, { registry, deliver })
  const triggers = new Triggers(ctx, { registry, handoffs })

  await lifecycle.ensureWorkspace()
  registerIdentity(ctx, { registry, memory, paths })
  registerTools(ctx, { registry, memory, lifecycle, handoffs })
  registerRoutes(ctx, { registry, memory, lifecycle, skills, routines, triggers, paths })

  ctx.on('agent/pre-step', async (payload, next) => {
    const decision = await next()
    if (decision.kind === 'reject') return decision
    const { agent, signal } = payload
    handoffs.observeStep(agent.session.id, decision.messages)
    const withContext = await handoffs.attachContext(agent, decision.messages, ctx.get('sessionReferenceResolver'), signal)
    return { ...decision, messages: await mentions.process(agent, withContext) }
  })

  skills.start()
  triggers.start()
}
