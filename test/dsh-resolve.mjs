// Resolve `@deepseek-ai/*` to the installed DeepSeek Harness runtime so tests
// exercise the real 0.2.1 packages. Run under the app's Electron (node mode),
// which reads app.asar transparently; see test/run.sh.
import { registerHooks } from 'node:module'
import { pathToFileURL } from 'node:url'

const ROOT = process.env.DSH_RUNTIME_MODULES
  ?? '/Applications/DeepSeek Harness.app/Contents/Resources/app.asar/dsh/node_modules'

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('@deepseek-ai/') && !context.parentURL?.includes('/app.asar/')) {
      const [scope, name, ...rest] = specifier.split('/')
      const entry = rest.length === 0 ? 'lib/index.js' : rest.join('/')
      return nextResolve(pathToFileURL(`${ROOT}/${scope}/${name}/${entry}`).href, context)
    }
    return nextResolve(specifier, context)
  },
})
