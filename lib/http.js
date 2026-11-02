import { BotError, errorMessage, isBotError } from './errors.js'

export const ROUTE_PREFIX = '/plugins/dsh-bot-team'
export const CLIENT_HEADER = 'x-dsh-bot-team'
const MAX_BODY_BYTES = 64 * 1024
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

function hostnameOf(host) {
  try {
    return new URL(`http://${host}`).hostname
  } catch {
    return undefined
  }
}

/**
 * Same rule as DSH's own `/api` fence, plus a required custom header: a loopback
 * Host, no `cross-site` fetch marker, an Origin (when present) naming this very
 * Host, and `x-dsh-bot-team: 1`. A cross-origin page cannot add the header
 * without a CORS preflight, and these routes never answer one.
 */
export function isTrustedRequest(headers) {
  const host = headers.host
  if (typeof host !== 'string') return false
  const hostname = hostnameOf(host)
  if (hostname === undefined || !(LOOPBACK_HOSTS.has(hostname) || /^127\./u.test(hostname))) return false
  if (headers['sec-fetch-site'] === 'cross-site') return false
  if (headers[CLIENT_HEADER] !== '1') return false
  const origin = headers.origin
  if (origin === undefined) return true
  try {
    const url = new URL(origin)
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.host === new URL(`${url.protocol}//${host}`).host
  } catch {
    return false
  }
}

export function sendJson(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(body))
}

async function readJson(req) {
  let size = 0
  const chunks = []
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY_BYTES) throw new BotError('body_too_large', `request body exceeds ${MAX_BODY_BYTES} bytes`, 413)
    chunks.push(chunk)
  }
  if (chunks.length === 0) return {}
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('not an object')
    return value
  } catch {
    throw new BotError('invalid_json', 'request body must be a JSON object')
  }
}

/**
 * Register one exact route path with a handler per method. GET handlers
 * receive the query parameters, POST handlers the parsed JSON body; a
 * `BotError` maps to its status and code.
 */
export function registerRoute(ctx, path, handlers) {
  const allowed = Object.keys(handlers).join(', ')
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: `${ROUTE_PREFIX}${path}`,
    handler: async (req, res) => {
      const handler = handlers[req.method]
      if (handler === undefined) return sendJson(res, 405, { code: 'method_not_allowed', message: `use ${allowed}` })
      if (!isTrustedRequest(req.headers)) return sendJson(res, 403, { code: 'untrusted_request', message: 'request is not from the Harness page' })
      try {
        const input = req.method === 'GET' ? Object.fromEntries(new URL(req.url ?? '/', 'http://local').searchParams) : await readJson(req)
        sendJson(res, 200, await handler(input))
      } catch (error) {
        if (isBotError(error)) return sendJson(res, error.status, { code: error.code, message: error.message })
        ctx.logger.warn('%s %s failed: %s', req.method, path, errorMessage(error))
        sendJson(res, 500, { code: 'internal_error', message: errorMessage(error) })
      }
    },
  }))
}

export function requireField(input, name, type = 'string') {
  const value = input[name]
  if (typeof value !== type || (type === 'string' && value.trim() === '')) throw new BotError('invalid_field', `${name} is required`)
  return value
}
