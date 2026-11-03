import { errorMessage } from './errors.js'
import { notice } from './handoff.js'

export const BOT_SCHEME = 'dsh-bot:'
const MENTION = /@\[((?:\\.|[^\\\]])*)\]\(dsh-bot:(bot-[0-9a-f]{8})\)/gu
const EVERYONE = /(^|[\s（(，,])@everyone(?=$|[\s）)，。,.!?！？:：])/u

export function formatMention(bot) {
  return `@[${bot.name.replace(/[\\\]]/gu, (match) => `\\${match}`)}](${BOT_SCHEME}${bot.id})`
}

/** Bot ids mentioned in order of first appearance, and the text with mentions rendered as `@name`. */
export function parseMentions(text) {
  const ids = []
  const readable = text.replace(MENTION, (_match, rawLabel, id) => {
    if (!ids.includes(id)) ids.push(id)
    return `@${rawLabel.replace(/\\(.)/gu, '$1')}`
  })
  return { ids, readable, everyone: EVERYONE.test(text) }
}

function messageText(message) {
  return message.content.filter((block) => block.type === 'text').map((block) => block.text).join('\n')
}

/**
 * Turn `@Bot` mentions in direct user messages into handoffs. In a group
 * Session only members are addressable and `@everyone` reaches all of them.
 */
export class Mentions {
  constructor({ registry, handoffs }) {
    this.registry = registry
    this.handoffs = handoffs
  }

  targetsFor(sessionId, parsed) {
    const group = this.registry.groupBySession(sessionId)
    let ids = parsed.ids
    if (group !== undefined) {
      ids = parsed.everyone ? [...new Set([...ids, ...group.members])] : ids.filter((id) => group.members.includes(id))
    }
    return ids
      .map((id) => this.registry.bot(id))
      .filter((bot) => bot !== undefined && bot.sessionId !== sessionId)
  }

  async process(agent, messages) {
    const sessionId = agent.session.id
    const out = []
    for (const message of messages) {
      out.push(message)
      if (message.source?.kind !== 'user') continue
      const parsed = parseMentions(messageText(message))
      const targets = this.targetsFor(sessionId, parsed)
      if (targets.length === 0) continue
      const delivered = []
      const followedUp = []
      const failed = []
      for (const bot of targets) {
        try {
          const result = await this.handoffs.send({ kind: 'mention', fromSessionId: sessionId, toBot: bot, text: parsed.readable, contextSessionId: sessionId })
          ;(result.followUp ? followedUp : delivered).push(`@${bot.name}`)
        } catch (error) {
          failed.push(`@${bot.name}（${errorMessage(error)}）`)
        }
      }
      const lines = []
      if (delivered.length > 0) lines.push(`本条消息已转交 ${delivered.join('、')}，对方回复后结果会送回这里。你只需一句话确认已转交，不要代答。`)
      if (followedUp.length > 0) lines.push(`已把这条催促或补充转达给 ${followedUp.join('、')}，对方会先回复进度再继续原任务。你只需一句话确认已转达，不要代答。`)
      if (failed.length > 0) lines.push(`转交失败：${failed.join('、')}。请如实告诉用户。`)
      out.push(notice(lines.join('\n')))
    }
    return out
  }
}
