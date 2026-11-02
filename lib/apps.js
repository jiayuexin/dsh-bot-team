const MCP_TOOL = /^mcp__([A-Za-z0-9_-]{1,32})__(.+)$/u

/** Connected MCP servers and their tools, derived from the global tool registry. */
export function listApps(tools) {
  const servers = new Map()
  for (const name of tools.view().visible.keys()) {
    const match = MCP_TOOL.exec(name)
    if (match === null) continue
    const [, server, tool] = match
    if (!servers.has(server)) servers.set(server, [])
    servers.get(server).push(tool)
  }
  return [...servers.entries()]
    .map(([server, list]) => ({ server, tools: list.sort() }))
    .sort((a, b) => a.server.localeCompare(b.server))
}
