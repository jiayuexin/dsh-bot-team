import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { BotError, errorMessage } from './errors.js'

/**
 * One JSON document on disk: strict load, serialized atomic writes.
 * The plugin is the only writer, so the in-memory value is authoritative
 * after `load()`; every `save()` replaces the file through a temp rename.
 */
export class JsonFile {
  constructor(path, { empty, validate }) {
    this.path = path
    this.empty = empty
    this.validate = validate
    this.tail = Promise.resolve()
  }

  async load() {
    let text
    try {
      text = await readFile(this.path, 'utf8')
    } catch (error) {
      if (error.code === 'ENOENT') return this.empty()
      throw new BotError('storage_unreadable', `${this.path}: ${errorMessage(error)}`, 500)
    }
    let value
    try {
      value = JSON.parse(text)
    } catch (error) {
      throw new BotError('registry_malformed', `${this.path} is not valid JSON: ${errorMessage(error)}`, 500)
    }
    this.validate(value)
    return value
  }

  save(value) {
    this.validate(value)
    const run = this.tail.then(async () => {
      await mkdir(dirname(this.path), { recursive: true })
      const temp = `${this.path}.${randomUUID()}.tmp`
      await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
      await rename(temp, this.path)
    })
    this.tail = run.catch(() => {})
    return run
  }
}
