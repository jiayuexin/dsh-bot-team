import { BotError } from './errors.js'
import { botSource } from './deliver.js'

/**
 * Scheduled routines are `dsh-schedule` reminders bound to the Bot's Session.
 * Listing, editing and deleting go through the shipped `schedule` Remote in
 * the browser; the Host only adds "run now".
 */
export class Routines {
  constructor(ctx, { registry, deliver }) {
    this.ctx = ctx
    this.registry = registry
    this.deliver = deliver
  }

  schedule() {
    const schedule = this.ctx.get('schedule')
    if (schedule === undefined) throw new BotError('schedule_unavailable', 'the schedule service is not part of this profile', 409)
    return schedule
  }

  async testSchedule(botId, scheduleId) {
    const bot = this.registry.requireBot(botId)
    const record = (await this.schedule().list({ sessionId: bot.sessionId })).find((item) => item.id === scheduleId)
    if (record === undefined) throw new BotError('schedule_not_found', `no active routine "${scheduleId}" for this Bot`, 404)
    await this.deliver(bot.sessionId, `【Routine 测试】${record.title}\n\n${record.prompt}`, botSource(`Routine 测试：${record.title}`, { role: 'routine-test', scheduleId }))
    return { scheduleId, delivered: true }
  }
}
