import { join } from 'node:path'

/** Every on-disk location the plugin owns, under `<DSH_HOME>/bot-team`. */
export function botTeamPaths(dshHome) {
  const root = join(dshHome, 'bot-team')
  const workspace = join(root, 'workspace')
  return {
    root,
    bots: join(root, 'bots.json'),
    handoffs: join(root, 'handoffs.json'),
    triggers: join(root, 'triggers.json'),
    memoryDir: join(root, 'memory'),
    privateSkillsRoot: join(root, 'skills'),
    workspace,
    sharedSkills: join(workspace, '.agents', 'skills'),
  }
}

export function memoryFile(paths, botId) {
  return join(paths.memoryDir, `${botId}.md`)
}

export function privateSkillsDir(paths, botId) {
  return join(paths.privateSkillsRoot, botId)
}
