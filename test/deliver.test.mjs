import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createDeliverer, botSource, textContent, DELIVERY_MODES } from '../lib/deliver.js'

function fakeCtx({ resolveError, persisted = true } = {}) {
  const calls = []
  const session = { id: 's-1' }
  const agent = Object.fromEntries(DELIVERY_MODES.map((mode) => [mode, (message) => calls.push({ mode, message })]))
  agent.session = session
  const ctx = {
    sessionController: { resolveAgent: async () => resolveError === undefined ? { agent } : { error: resolveError } },
    sessions: { flush: async (flushed) => { calls.push({ flushed: flushed === session }); return persisted } },
  }
  return { ctx, calls }
}

test('each delivery mode calls the matching agent method and then flushes the Session', async () => {
  for (const mode of DELIVERY_MODES) {
    const { ctx, calls } = fakeCtx()
    const id = await createDeliverer(ctx)('s-1', textContent('hi'), botSource('hi', { role: 'reply' }), mode)
    assert.deepEqual(calls.map((call) => call.mode ?? 'flush'), [mode, 'flush'])
    assert.equal(calls[0].message.id, id)
    assert.equal(calls[0].message.source.role, 'reply')
    assert.equal(calls[1].flushed, true)
  }
})

test('an unknown mode, an unresumable Session and an unpersisted message all fail loudly', async () => {
  const deliver = createDeliverer(fakeCtx().ctx)
  await assert.rejects(deliver('s-1', textContent('x'), botSource('x'), 'wake'), TypeError)
  await assert.rejects(createDeliverer(fakeCtx({ resolveError: new Error('gone') }).ctx)('s-1', textContent('x'), botSource('x'), 'inject'), { code: 'session_unavailable' })
  await assert.rejects(createDeliverer(fakeCtx({ persisted: false }).ctx)('s-1', textContent('x'), botSource('x'), 'inject'), { code: 'delivery_not_persisted' })
})
