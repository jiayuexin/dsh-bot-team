import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MEMORY_LIMIT_BYTES } from '../lib/memory.js'
import { tempPaths, loadedMemory } from './fakes.mjs'

test('add, de-duplicate, remove and replace entries', async (t) => {
  const paths = await tempPaths(t)
  const memory = await loadedMemory(paths, ['bot-00000001'])
  await memory.remember('bot-00000001', 'add', '报表一律用 CSV')
  await memory.remember('bot-00000001', 'add', '报表一律用 CSV')
  await memory.remember('bot-00000001', 'add', '周一提醒对账')
  assert.equal(memory.read('bot-00000001'), '- 报表一律用 CSV\n- 周一提醒对账')
  await memory.remember('bot-00000001', 'remove', '周一提醒对账')
  assert.equal(memory.read('bot-00000001'), '- 报表一律用 CSV')
  await assert.rejects(memory.remember('bot-00000001', 'remove', 'missing'), { code: 'memory_entry_not_found' })
  await memory.remember('bot-00000001', 'replace', '- 只有这一条')
  assert.equal(memory.read('bot-00000001'), '- 只有这一条')
})

test('memory survives a reload', async (t) => {
  const paths = await tempPaths(t)
  const memory = await loadedMemory(paths, ['bot-00000001'])
  await memory.remember('bot-00000001', 'add', 'keep me')
  const reloaded = await loadedMemory(paths, ['bot-00000001'])
  assert.equal(reloaded.read('bot-00000001'), '- keep me')
})

test('memory over the limit is refused and the previous text kept', async (t) => {
  const memory = await loadedMemory(await tempPaths(t), ['bot-00000001'])
  await memory.remember('bot-00000001', 'add', 'small')
  await assert.rejects(memory.write('bot-00000001', 'x'.repeat(MEMORY_LIMIT_BYTES + 1)), { code: 'memory_too_large' })
  assert.equal(memory.read('bot-00000001'), '- small')
})

test('unknown operations and empty entries are refused', async (t) => {
  const memory = await loadedMemory(await tempPaths(t), ['bot-00000001'])
  await assert.rejects(memory.remember('bot-00000001', 'drop', 'x'), { code: 'invalid_memory' })
  await assert.rejects(memory.remember('bot-00000001', 'add', '   '), { code: 'invalid_memory' })
})
