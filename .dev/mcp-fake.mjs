// Dev-only stdio MCP server: one `notifications` tool that returns the items in
// .dev/mcp-items.json, so event-routine polling can be exercised end to end.
import { readFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'

const itemsFile = fileURLToPath(new URL('./mcp-items.json', import.meta.url))
const send = (message) => process.stdout.write(`${JSON.stringify(message)}\n`)

createInterface({ input: process.stdin }).on('line', (line) => {
  if (line.trim() === '') return
  const request = JSON.parse(line)
  if (request.id === undefined) return
  const reply = (result) => send({ jsonrpc: '2.0', id: request.id, result })
  switch (request.method) {
    case 'initialize':
      return reply({ protocolVersion: request.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'fake-github', version: '0.0.1' } })
    case 'ping':
      return reply({})
    case 'tools/list':
      return reply({ tools: [{ name: 'notifications', description: 'List notifications', inputSchema: { type: 'object', properties: { all: { type: 'boolean' } } } }] })
    case 'tools/call':
      return reply({ content: [{ type: 'text', text: readFileSync(itemsFile, 'utf8') }] })
    default:
      return send({ jsonrpc: '2.0', id: request.id, error: { code: -32601, message: `unsupported ${request.method}` } })
  }
})
