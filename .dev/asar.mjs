// Dev-only: read DeepSeek Harness 0.2.1 sources from the installed app.asar.
// Run with the app's Electron in node mode:
//   ELECTRON_RUN_AS_NODE=1 "/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness" .dev/asar.mjs <cmd> ...
//   cmd: ls <pkg> [subdir] | cat <pkg> <file> [from] [to] | grep <pkg|*> <regex> [context]
import fs from 'node:fs'
import path from 'node:path'

const ROOT = '/Applications/DeepSeek Harness.app/Contents/Resources/app.asar/dsh/node_modules/@deepseek-ai'
const [cmd, a, b, c, d] = process.argv.slice(2)

function filesOf(dir) {
  const out = []
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name)
    if (name === 'node_modules') continue
    const stat = fs.statSync(full)
    if (stat.isDirectory()) out.push(...filesOf(full))
    else if (/\.(js|d\.ts|md|yml|json)$/.test(name)) out.push(full)
  }
  return out
}

if (cmd === 'ls') {
  console.log(fs.readdirSync(path.join(ROOT, a ?? '', b ?? '')).join('\n'))
} else if (cmd === 'cat') {
  const lines = fs.readFileSync(path.join(ROOT, a, b), 'utf8').split('\n')
  const from = Number(c ?? 1), to = Number(d ?? lines.length)
  lines.slice(from - 1, to).forEach((l, i) => console.log(`${from + i}: ${l}`))
} else if (cmd === 'grep') {
  const re = new RegExp(b)
  const ctx = Number(c ?? 0)
  const pkgs = a === '*' ? fs.readdirSync(ROOT) : [a]
  for (const pkg of pkgs) {
    let files = []
    try { files = filesOf(path.join(ROOT, pkg)) } catch { continue }
    for (const file of files) {
      const lines = fs.readFileSync(file, 'utf8').split('\n')
      lines.forEach((line, i) => {
        if (!re.test(line)) return
        const rel = path.relative(ROOT, file)
        for (let j = Math.max(0, i - ctx); j <= Math.min(lines.length - 1, i + ctx); j++) {
          console.log(`${rel}:${j + 1}:${lines[j].slice(0, 240)}`)
        }
        if (ctx) console.log('--')
      })
    }
  }
} else {
  console.error('usage: ls|cat|grep')
  process.exit(2)
}
