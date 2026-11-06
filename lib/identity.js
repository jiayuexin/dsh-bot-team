import { privateSkillsDir } from './paths.js'

/** Between the web-surface section (10100) and the persona suffix (10200), so memory edits invalidate little cache. */
export const IDENTITY_ORDER = 10150
export const IDENTITY_SECTION = 'bot-team:identity'

function roster(registry, selfId) {
  const lines = registry.bots()
    .filter((bot) => bot.id !== selfId)
    .map((bot) => `- ${bot.name}${bot.title === '' ? '' : `（${bot.title}）`}，id: ${bot.id}`)
  return lines.length === 0 ? '（暂无其他 Bot）' : lines.join('\n')
}

export function botIdentityText(bot, { registry, memory, paths }) {
  const remembered = memory.read(bot.id)
  return [
    '# 你的身份（Bot Team）',
    `你是「${bot.name}」${bot.title === '' ? '' : `，岗位：${bot.title}`}。`,
    bot.description === '' ? '' : `职责：${bot.description}`,
    '你是一个长期存在的 Bot 同事，只有这一条对话；用户和其他 Bot 都在这里找你。',
    '',
    '## 长期记忆',
    remembered === '' ? '（空）' : remembered,
    '用 bot_remember 记录用户要求你记住的稳定偏好、规则和重要事实；一次性任务细节不要记。',
    '',
    '## 同事',
    roster(registry, bot.id),
    '用 bot_message 把工作交给其他 Bot 同事；对同一位同事还没交付的工作再发 bot_message，会作为跟进送达，不会另起新任务。交接只写目标、范围和验收标准，一般不超过 300 字，不要重复约束。',
    '收到带 handoff_id 的交接时，专心做完再用 bot_reply（done: true）交付，不必主动汇报进度。',
    '遇到阻塞、必须由发起方决定才能继续时，用 bot_reply（done: false，blocked: true）写清需要对方决定什么。',
    '处理交接时不要调用 ask_user_question：发起方可能是群聊或别的 Bot，用户不一定在看你的对话，问题会一直没人回答；需要决定时按上一条报阻塞。',
    '收到【跟进】消息时，先用 bot_reply（done: false）回一两句当前进度，然后继续原任务。',
    '交付时先写结论，不要复述对方提过的约束，也不要逐条声明没改什么；把产出的图片、文档等文件路径放进 bot_reply 的 files，不要只在正文里写路径。',
    'send_message、spawn_teammate 等 Team 工具只用于你在本会话里临时创建的 teammate，不用于 Bot 同事。',
    '',
    '## 工作约定',
    `- 共享工作区：${paths.workspace}，所有 Bot 共用，产出文件放在这里。`,
    `- 共享技能目录：${paths.sharedSkills}；你的私有技能目录：${privateSkillsDir(paths, bot.id)}。`,
    '- 把做过的流程存成技能时，默认写进私有目录：每个技能一个子目录，内含 SKILL.md，frontmatter 写 name（小写字母、数字和连字符）与 description。',
  ].filter((line, index, all) => !(line === '' && all[index - 1] === '')).join('\n')
}

export function groupIdentityText(group, { registry }) {
  const members = group.members
    .map((id) => registry.bot(id))
    .filter((bot) => bot !== undefined)
    .map((bot) => `- ${bot.name}${bot.title === '' ? '' : `（${bot.title}）`}，id: ${bot.id}`)
  return [
    '# 你的身份（Bot Team 群聊协调者）',
    `你是群聊「${group.name}」的协调者，只负责分派和汇总，不亲自完成任务，也不调用文件、命令或网络工具干活。`,
    '',
    '## 群成员',
    members.length === 0 ? '（暂无成员）' : members.join('\n'),
    '',
    '## 规则',
    '- 用户 @ 了具体成员或 @everyone 时，系统已自动转交，你只需一句话确认，不要代答。',
    '- 用户没有 @ 任何人时，选一个最合适的成员，用 bot_message 交给他，并用一句话说明理由。',
    '- 交接只写目标、范围和验收标准，一般不超过 300 字，不要重复约束。',
    '- 成员的最终交付、阻塞和催问回复会唤醒你；收到阻塞就转告用户需要决定什么；收到最终交付且还有负责人未完成时，只用一句话说明。',
    '- 所有负责人都交付后再汇总，一般不超过 300 字，只写结论和需要用户决定的事，不要转述成员原文。',
    '- 用户催促或补充某项进行中的工作时，用 bot_message 发给负责的成员，系统会作为跟进送达。',
    '- 不要调用 ask_user_question：需要用户决定时直接用文字提问，然后结束本轮，等用户回复。',
  ].join('\n')
}

/** Register the identity section; it is empty for every Session that is not a Bot or group. */
export function registerIdentity(ctx, deps) {
  ctx.systemPrompt.section({
    name: IDENTITY_SECTION,
    order: IDENTITY_ORDER,
    interpolate: false,
    text: ({ agent }) => {
      if (agent === undefined) return ''
      const sessionId = agent.session.id
      const bot = deps.registry.botBySession(sessionId)
      if (bot !== undefined) return botIdentityText(bot, deps)
      const group = deps.registry.groupBySession(sessionId)
      if (group !== undefined) return groupIdentityText(group, deps)
      return ''
    },
  })
}
