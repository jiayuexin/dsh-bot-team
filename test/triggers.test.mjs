import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Triggers, classify, readPath, resultJson } from '../lib/triggers.js'
import { Handoffs } from '../lib/handoff.js'
import { tempPaths, loadedRegistry, recordingDeliver, silentLogger } from './fakes.mjs'

const avatar = { shape: 'circle', color: '#112233' }

test('readPath and resultJson read structured or text JSON', () => {
  assert.equal(readPath({ a: { b: [{ c: 3 }] } }, 'a.b.0.c'), 3)
  assert.deepEqual(readPath([1], ''), [1])
  assert.deepEqual(resultJson({ structuredContent: { x: 1 } }), { x: 1 })
  assert.deepEqual(resultJson({ content: [{ type: 'text', text: '[{"id":1}]' }] }), [{ id: 1 }])
  assert.throws(() => resultJson({ content: [{ type: 'text', text: 'not json' }] }), /not JSON/)
})

test('classify de-duplicates by id and filters by keyword and regex', () => {
  const trigger = { itemsPath: 'items', idPath: 'id', seenIds: ['1'], match: { keywords: ['Needs Repro'], regex: 'P[0-9]' } }
  const json = { items: [{ id: 1, title: 'needs repro P1' }, { id: 2, title: 'needs repro P2' }, { id: 3, title: 'needs repro' }, { id: 4, title: 'P3 other' }] }
  const result = classify(trigger, json)
  assert.deepEqual(result.ids, ['1', '2', '3', '4'])
  assert.deepEqual(result.fresh.map((entry) => entry.id), ['2', '3', '4'])
  assert.deepEqual(result.matched.map((entry) => entry.id), ['2'])
  assert.throws(() => classify({ ...trigger, itemsPath: 'missing' }, json), /does not point to a list/)
  assert.throws(() => classify({ ...trigger, idPath: 'nope' }, json), /no scalar id/)
})

async function setup(t, results) {
  const paths = await tempPaths(t)
  const registry = await loadedRegistry(paths)
  const bot = await registry.createBot({ name: 'Watcher', avatar, sessionId: 's-watch' })
  const { deliver, deliveries } = recordingDeliver()
  const handoffs = new Handoffs({ registry, deliver, logger: silentLogger })
  let call = 0
  const executed = []
  const ctx = {
    logger: silentLogger,
    effect() {},
    tools: {
      get: (name) => name === 'mcp__github__notifications' ? {
        execute: async (args) => { executed.push(args); return results[Math.min(call++, results.length - 1)] },
      } : undefined,
    },
  }
  const triggers = new Triggers(ctx, { registry, handoffs })
  const trigger = await registry.createTrigger({
    botId: bot.id, title: 'needs repro', server: 'github', tool: 'notifications', args: { all: false },
    itemsPath: '', idPath: 'id', match: { keywords: ['needs repro'] }, prompt: '复现并回报', intervalSeconds: 60,
  })
  return { registry, triggers, trigger, deliveries, executed, bot }
}

const json = (items) => ({ content: [{ type: 'text', text: JSON.stringify(items) }] })

test('the first poll only records existing items; later polls deliver new matching items once', async (t) => {
  const { registry, triggers, trigger, deliveries, executed, bot } = await setup(t, [
    json([{ id: 'a', title: 'needs repro old' }]),
    json([{ id: 'a', title: 'needs repro old' }, { id: 'b', title: 'needs repro new' }, { id: 'c', title: 'unrelated' }]),
    json([{ id: 'a' }, { id: 'b', title: 'needs repro new' }, { id: 'c' }]),
  ])
  assert.deepEqual(await triggers.run(trigger.id), { ok: true, primed: true, recorded: 1, delivered: 0 })
  assert.equal(deliveries.length, 0)
  assert.deepEqual(await triggers.run(trigger.id), { ok: true, primed: false, fresh: 2, delivered: 1 })
  assert.equal(deliveries.length, 1)
  assert.equal(deliveries[0].sessionId, bot.sessionId)
  assert.match(deliveries[0].text, /needs repro new/)
  assert.equal(deliveries[0].source.role, 'handoff')
  assert.deepEqual(await triggers.run(trigger.id), { ok: true, primed: false, fresh: 0, delivered: 0 })
  assert.equal(deliveries.length, 1)
  assert.deepEqual(executed[0], { all: false })
  assert.deepEqual(registry.trigger(trigger.id).seenIds, ['a', 'b', 'c'])
})

test('a poll failure is recorded on the routine instead of being retried silently', async (t) => {
  const { registry, triggers, trigger } = await setup(t, [{ content: [{ type: 'text', text: 'oops' }] }])
  const outcome = await triggers.run(trigger.id)
  assert.equal(outcome.ok, false)
  assert.match(registry.trigger(trigger.id).lastError, /not JSON/)
  await registry.updateTrigger(trigger.id, { server: 'gone' })
  await triggers.run(trigger.id)
  assert.match(registry.trigger(trigger.id).lastError, /not connected/)
})

test('the ticker skips paused routines and routines polled within their interval', async (t) => {
  const { registry, triggers, trigger, executed } = await setup(t, [json([])])
  await registry.updateTrigger(trigger.id, { enabled: false })
  triggers.tick(Date.now())
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(executed.length, 0)
  await registry.updateTrigger(trigger.id, { enabled: true, lastRunAt: Date.now() })
  triggers.tick(Date.now())
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(executed.length, 0)
  triggers.tick(Date.now() + 61_000)
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.equal(executed.length, 1)
})

test('trigger validation refuses short intervals and bad regular expressions', async (t) => {
  const { registry, bot } = await setup(t, [json([])])
  const base = { botId: bot.id, title: 't', server: 's', tool: 't', idPath: 'id', prompt: 'p' }
  await assert.rejects(registry.createTrigger({ ...base, intervalSeconds: 10 }), { code: 'invalid_trigger' })
  await assert.rejects(registry.createTrigger({ ...base, intervalSeconds: 60, match: { regex: '(' } }), { code: 'invalid_trigger' })
})
