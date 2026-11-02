import { mkdirSync, watch } from 'node:fs'
import { mkdir, readdir, readFile, rename, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { BotError } from './errors.js'
import { privateSkillsDir } from './paths.js'

export const PRIVATE_PROVIDER = 'bot-private'
export const SHARED_PROVIDER = 'bot-shared'
/** Lower ranks win: private over shared, both over skill-filesystem's `project-agents` (200). */
export const PRIVATE_RANK = 150
export const SHARED_RANK = 190
const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** Read `name`, `description` and `whenToUse` from a SKILL.md frontmatter block. */
export function parseSkillFile(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/u.exec(text)
  if (match === null) return undefined
  const fields = {}
  for (const line of match[1].split(/\r?\n/u)) {
    const pair = /^([A-Za-z][\w-]*):\s*(.*)$/u.exec(line)
    if (pair !== null) fields[pair[1]] = pair[2].trim().replace(/^(['"])(.*)\1$/u, '$2')
  }
  if (typeof fields.name !== 'string' || !SKILL_NAME.test(fields.name)) return undefined
  if (typeof fields.description !== 'string' || fields.description === '') return undefined
  return { name: fields.name, description: fields.description, whenToUse: fields.whenToUse, content: match[2] }
}

/** Skills in one root: each `<dir>/SKILL.md` whose frontmatter is valid. */
export async function scanSkills(root) {
  let entries
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch (error) {
    if (error.code === 'ENOENT') return []
    throw error
  }
  const skills = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const path = join(root, entry.name, 'SKILL.md')
    let text
    try {
      text = await readFile(path, 'utf8')
    } catch {
      continue
    }
    const parsed = parseSkillFile(text)
    if (parsed !== undefined) skills.push({ ...parsed, dir: entry.name, path, resourceBase: join(root, entry.name) })
  }
  return skills.sort((a, b) => a.name.localeCompare(b.name))
}

/** A skill provider over one directory of `<name>/SKILL.md` bundles, invalidated when the directory changes. */
function directoryProvider(name, rank, root, control) {
  const watcher = watch(root, { recursive: true }, () => control.invalidate())
  control.signal.addEventListener('abort', () => watcher.close(), { once: true })
  return {
    name,
    async list() {
      return (await scanSkills(root)).map((skill) => ({
        name: skill.name,
        description: skill.description,
        ...skill.whenToUse === undefined ? {} : { whenToUse: skill.whenToUse },
        invocation: { modelInvocable: true, userInvocable: true },
        source: name,
        provider: name,
        rank,
        locator: skill.path,
        path: skill.path,
        resourceBase: skill.resourceBase,
      }))
    },
    async get(candidate) {
      const parsed = parseSkillFile(await readFile(candidate.locator, 'utf8'))
      if (parsed === undefined) throw new Error(`skill file ${candidate.locator} has no valid frontmatter`)
      return {
        name: parsed.name,
        description: parsed.description,
        ...parsed.whenToUse === undefined ? {} : { whenToUse: parsed.whenToUse },
        invocation: candidate.invocation,
        source: name,
        provider: name,
        content: parsed.content,
        path: candidate.locator,
        resourceBase: candidate.resourceBase,
      }
    },
  }
}

/**
 * Bot skills: on every live Bot agent's own scope, a private provider (that
 * Bot's directory) and a shared provider (`<workspace>/.agents/skills`). Both
 * are scoped to Bot agents, so ordinary Sessions never list them, and the
 * shared root is found without relying on skill-filesystem's project-root guess.
 */
export class BotSkills {
  constructor(ctx, { registry, paths }) {
    this.ctx = ctx
    this.registry = registry
    this.paths = paths
    this.installed = new Map()
  }

  start() {
    this.ctx.effect(() => () => {
      for (const agent of [...this.installed.keys()]) this.uninstall(agent)
    })
    this.ctx.on('agent/created', ({ agent }) => this.maybeInstall(agent))
    this.ctx.on('agent/disposed', ({ agent }) => this.uninstall(agent))
    this.ctx.effect(() => this.registry.onChange((doc) => {
      if (doc === 'bots') this.refresh()
    }))
    this.refresh()
  }

  refresh() {
    for (const agent of this.ctx.agents.list()) this.maybeInstall(agent)
  }

  /** Register the Bot's providers on its agent scope; a fiber under `agent.ctx` that waits for `skills`. */
  maybeInstall(agent) {
    if (this.installed.has(agent)) return
    const bot = this.registry.botBySession(agent.session.id)
    if (bot === undefined) return
    const privateRoot = privateSkillsDir(this.paths, bot.id)
    const sharedRoot = this.paths.sharedSkills
    try {
      mkdirSync(privateRoot, { recursive: true })
      mkdirSync(sharedRoot, { recursive: true })
      const fiber = agent.ctx.inject(['skills'], (scoped) => {
        scoped.skills.registerProvider((control) => directoryProvider(PRIVATE_PROVIDER, PRIVATE_RANK, privateRoot, control))
        scoped.skills.registerProvider((control) => directoryProvider(SHARED_PROVIDER, SHARED_RANK, sharedRoot, control))
      })
      this.installed.set(agent, () => fiber.dispose())
    } catch (error) {
      this.ctx.logger.warn('private skills for %s unavailable: %s', bot.id, error.message)
    }
  }

  uninstall(agent) {
    const dispose = this.installed.get(agent)
    this.installed.delete(agent)
    try {
      dispose?.()
    } catch (error) {
      this.ctx.logger.warn('private skills teardown failed: %s', error.message)
    }
  }

  async list(botId) {
    this.registry.requireBot(botId)
    const view = (skill) => ({ name: skill.name, description: skill.description, dir: skill.dir })
    return {
      shared: (await scanSkills(this.paths.sharedSkills)).map(view),
      private: (await scanSkills(privateSkillsDir(this.paths, botId))).map(view),
    }
  }

  /** Move one skill directory between the Bot's private root and the shared root. */
  async move(botId, dir, to) {
    this.registry.requireBot(botId)
    if (typeof dir !== 'string' || dir === '' || dir.includes('/') || dir.includes('\\') || dir.startsWith('.')) throw new BotError('invalid_skill', 'skill directory name is invalid')
    if (to !== 'shared' && to !== 'private') throw new BotError('invalid_skill', 'to must be shared or private')
    const privateRoot = privateSkillsDir(this.paths, botId)
    const [from, target] = to === 'shared' ? [privateRoot, this.paths.sharedSkills] : [this.paths.sharedSkills, privateRoot]
    try {
      await stat(join(from, dir))
    } catch {
      throw new BotError('skill_not_found', `no skill directory "${dir}"`, 404)
    }
    try {
      await stat(join(target, dir))
      throw new BotError('skill_exists', `"${dir}" already exists at the destination`, 409)
    } catch (error) {
      if (error instanceof BotError) throw error
    }
    await mkdir(target, { recursive: true })
    await rename(join(from, dir), join(target, dir))
    return this.list(botId)
  }
}
