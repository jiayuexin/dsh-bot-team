import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { BotError } from './errors.js'
import { memoryFile } from './paths.js'

export const MEMORY_LIMIT_BYTES = 8 * 1024

/**
 * Long-term memory, one Markdown file per Bot. Reads are served from a cache
 * filled at load time and on every write, because prompt assembly is synchronous.
 */
export class MemoryStore {
  constructor(paths) {
    this.paths = paths
    this.cache = new Map()
    this.tails = new Map()
  }

  async load(botIds) {
    await mkdir(this.paths.memoryDir, { recursive: true })
    const present = new Set((await readdir(this.paths.memoryDir)).filter((name) => name.endsWith('.md')).map((name) => name.slice(0, -3)))
    for (const id of botIds) {
      this.cache.set(id, present.has(id) ? (await readFile(memoryFile(this.paths, id), 'utf8')).replace(/\r\n/g, '\n').trim() : '')
    }
  }

  read(botId) {
    return this.cache.get(botId) ?? ''
  }

  async write(botId, text) {
    if (typeof text !== 'string') throw new BotError('invalid_memory', 'memory must be text')
    const normalized = text.replace(/\r\n/g, '\n').trim()
    if (Buffer.byteLength(normalized, 'utf8') > MEMORY_LIMIT_BYTES) {
      throw new BotError('memory_too_large', `memory is limited to ${MEMORY_LIMIT_BYTES} bytes; consolidate existing entries first`, 413)
    }
    const run = (this.tails.get(botId) ?? Promise.resolve()).then(async () => {
      await mkdir(this.paths.memoryDir, { recursive: true })
      const target = memoryFile(this.paths, botId)
      const temp = `${target}.${randomUUID()}.tmp`
      await writeFile(temp, normalized === '' ? '' : `${normalized}\n`, 'utf8')
      await rename(temp, target)
      this.cache.set(botId, normalized)
      return normalized
    })
    this.tails.set(botId, run.catch(() => {}))
    return run
  }

  /** Apply one `bot_remember` operation to the entry list. */
  async remember(botId, op, text) {
    const entries = this.read(botId).split('\n').map((line) => line.trim()).filter((line) => line !== '')
    const item = typeof text === 'string' ? text.replace(/\s+/g, ' ').trim() : ''
    if (op === 'add') {
      if (item === '') throw new BotError('invalid_memory', 'text must not be empty')
      const line = `- ${item}`
      if (!entries.includes(line)) entries.push(line)
    } else if (op === 'remove') {
      const index = entries.indexOf(`- ${item}`)
      if (index < 0) throw new BotError('memory_entry_not_found', `no memory entry "${item}"`, 404)
      entries.splice(index, 1)
    } else if (op === 'replace') {
      return this.write(botId, typeof text === 'string' ? text : '')
    } else {
      throw new BotError('invalid_memory', 'op must be add, remove or replace')
    }
    return this.write(botId, entries.join('\n'))
  }

  async remove(botId) {
    this.cache.delete(botId)
    await rm(memoryFile(this.paths, botId), { force: true })
  }
}
