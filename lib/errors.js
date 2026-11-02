/** Stable, user-facing failure with an HTTP status and a machine-readable code. */
export class BotError extends Error {
  constructor(code, message, status = 400) {
    super(message)
    this.name = 'BotError'
    this.code = code
    this.status = status
  }
}

export function isBotError(error) {
  return error instanceof BotError
}

export function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}
