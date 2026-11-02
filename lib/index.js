import { createUserMessage } from '@deepseek-ai/dsh-llm'

export const name = 'dsh-bot-team'
export const inject = ['webServer']

export function apply(ctx) {
  const resolved = import.meta.resolve('@deepseek-ai/dsh-llm')
  ctx.logger('dsh-bot-team').info('dsh-llm resolved to %s (createUserMessage: %s)', resolved, typeof createUserMessage)
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/plugins/dsh-bot-team/ping',
    handler: (req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ ok: true, resolved, headers: req.headers }))
    },
  }))
}
