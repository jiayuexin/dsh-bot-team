import { mkdir } from 'node:fs/promises'
import { BotError, errorMessage } from './errors.js'
import { botSource, textContent } from './deliver.js'
import { privateSkillsDir } from './paths.js'

export const WORKSPACE_TITLE = 'Bot 工作区'
export const BOT_PRESET = 'standard'
export const BOT_PERMISSION = 'danger-full-access'

function kickoffText(bot) {
  return [
    `你刚被创建为 Bot 同事「${bot.name}」${bot.title === '' ? '' : `，岗位：${bot.title}`}。`,
    bot.description === '' ? '' : `职责：${bot.description}`,
    '请用两三句话向用户做自我介绍，说明你能帮忙做什么，然后等待安排。',
  ].filter((line) => line !== '').join('\n')
}

function groupKickoffText(group, registry) {
  const names = group.members.map((id) => registry.bot(id)?.name).filter(Boolean).join('、')
  return `群聊「${group.name}」已创建，成员：${names}。请用一句话向用户说明：可以 @ 某个成员或 @everyone 分派工作，不 @ 时由你挑选负责人。`
}

/**
 * Create, re-create and remove Bots and groups. Every entry point (the page
 * and the `bot_create` tool) goes through here, so a Bot always owns a
 * non-blank Session in the shared Workspace.
 */
export class Lifecycle {
  constructor(ctx, { registry, memory, paths, deliver }) {
    this.ctx = ctx
    this.registry = registry
    this.memory = memory
    this.paths = paths
    this.deliver = deliver
  }

  async ensureWorkspace() {
    await mkdir(this.paths.sharedSkills, { recursive: true })
    const existing = await this.ctx.workspaceRegistry.resolveByPath(this.paths.workspace)
    return existing ?? await this.ctx.workspaceRegistry.create(this.paths.workspace, WORKSPACE_TITLE)
  }

  async newSession() {
    const workspace = await this.ensureWorkspace()
    const { sessionId } = await this.ctx.sessionController.create({ workspaceId: workspace.id, agentPreset: BOT_PRESET })
    await this.applyPermission(sessionId, BOT_PERMISSION)
    return sessionId
  }

  async applyPermission(sessionId, preset) {
    const presets = this.ctx.get('permissionPresets')
    if (presets === undefined || !presets.names.includes(preset)) return
    const resolved = await this.ctx.sessionController.resolveAgent(sessionId)
    if ('error' in resolved) throw new BotError('session_unavailable', `session "${sessionId}": ${errorMessage(resolved.error)}`, 409)
    presets.set(resolved.agent.session, preset)
  }

  /** Whether the shipped auto-review bundle registered the `auto` permission preset. */
  autoReviewAvailable() {
    return this.ctx.get('permissionPresets')?.names.includes('auto') === true
  }

  async autoReview(botId) {
    const bot = this.registry.requireBot(botId)
    const presets = this.ctx.get('permissionPresets')
    if (presets === undefined) return { available: false, enabled: false }
    const resolved = await this.ctx.sessionController.resolveAgent(bot.sessionId)
    if ('error' in resolved) throw new BotError('session_unavailable', `session "${bot.sessionId}": ${errorMessage(resolved.error)}`, 409)
    return { available: this.autoReviewAvailable(), enabled: presets.current(resolved.agent.session) === 'auto' }
  }

  async setAutoReview(botId, enabled) {
    const bot = this.registry.requireBot(botId)
    if (!this.autoReviewAvailable()) {
      throw new BotError('auto_review_unavailable', '自动审查未开启：请先在「插件」页启用 DeepSeek Harness 自带的「自动审查」(dsh-experimental-auto-review)。', 409)
    }
    await this.applyPermission(bot.sessionId, enabled ? 'auto' : BOT_PERMISSION)
    return this.autoReview(botId)
  }

  async createBot(input, createdBy = 'user') {
    this.registry.assertCanCreateBot(typeof input.name === 'string' ? input.name : '')
    const sessionId = await this.newSession()
    const bot = await this.registry.createBot({ ...input, sessionId, createdBy })
    await mkdir(privateSkillsDir(this.paths, bot.id), { recursive: true })
    await this.deliver(sessionId, textContent(kickoffText(bot)), botSource(`Bot「${bot.name}」已创建`, { role: 'kickoff' }), 'followup')
    return bot
  }

  /** Give a Bot a fresh Session after its old one was deleted outside the page. */
  async recreateSession(botId) {
    const bot = this.registry.requireBot(botId)
    const sessionId = await this.newSession()
    const updated = await this.registry.updateBot(bot.id, { sessionId })
    await this.deliver(sessionId, textContent(kickoffText(updated)), botSource(`Bot「${updated.name}」的会话已重建`, { role: 'kickoff' }), 'followup')
    return updated
  }

  async removeBot(botId) {
    const bot = this.registry.requireBot(botId)
    const schedule = this.ctx.get('schedule')
    if (schedule !== undefined) {
      for (const record of await schedule.list({ sessionId: bot.sessionId })) {
        await schedule.delete({ sessionId: bot.sessionId, id: record.id })
      }
    }
    await this.registry.removeTriggersOf(bot.id)
    await this.memory.remove(bot.id)
    return this.registry.removeBot(bot.id)
  }

  async createGroup(input) {
    this.registry.assertGroupInput(input)
    const sessionId = await this.newSession()
    const group = await this.registry.createGroup({ ...input, sessionId })
    await this.deliver(sessionId, textContent(groupKickoffText(group, this.registry)), botSource(`群聊「${group.name}」已创建`, { role: 'kickoff' }), 'followup')
    return group
  }

  async removeGroup(groupId) {
    return this.registry.removeGroup(groupId)
  }
}
