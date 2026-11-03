import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { botTeamPaths } from '../lib/paths.js'
import { Registry } from '../lib/registry.js'
import { MemoryStore } from '../lib/memory.js'
import { DELIVERY_MODES } from '../lib/deliver.js'

export async function tempPaths(t) {
  const home = await mkdtemp(join(tmpdir(), 'bot-team-test-'))
  t.after(() => rm(home, { recursive: true, force: true }))
  return botTeamPaths(home)
}

export async function loadedRegistry(paths, options) {
  const registry = new Registry(paths, options)
  await registry.load()
  return registry
}

export async function loadedMemory(paths, ids = []) {
  const memory = new MemoryStore(paths)
  await memory.load(ids)
  return memory
}

/** A minimal live agent: what the plugin reads from `exec.agent` and pre-step payloads. */
export function fakeAgent(sessionId, { delegationDepth = 0 } = {}) {
  return { id: sessionId, options: {}, session: { id: sessionId, header: { delegationDepth, cwd: '/tmp' } } }
}

/** Records every delivery instead of resuming a real Session; `text` joins the text blocks. */
export function recordingDeliver() {
  const deliveries = []
  const deliver = async (sessionId, content, source, mode) => {
    if (!DELIVERY_MODES.includes(mode)) throw new TypeError(`bad delivery mode ${String(mode)}`)
    const text = content.filter((block) => block.type === 'text').map((block) => block.text).join('\n')
    deliveries.push({ sessionId, content, text, source, mode })
    return `message-${deliveries.length}`
  }
  return { deliver, deliveries }
}

export const silentLogger = { warn() {}, info() {}, error() {} }
