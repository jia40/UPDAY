import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import ts from 'typescript'

const output = ts.transpileModule(readFileSync(new URL('../src/lib/refreshQueue.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText
const api = {}
new Function('exports', output)(api)

function harness() {
  const reads = [], values = [], errors = []
  const load = async current => {
    try {
      const value = await new Promise((resolve, reject) => reads.push({ resolve, reject }))
      if (current()) values.push(value)
    } catch (error) { if (current()) errors.push(error.message) }
  }
  const queue = api.createRefreshQueue()
  queue.configure(load, false)
  return { queue, load, reads, values, errors }
}

test('StrictMode setup-cleanup-setup starts one current read and concurrent callers share it', async () => {
  const { queue, reads, values } = harness()
  queue.start(); queue.stop(); queue.start()
  const first = queue.request()
  assert.equal(queue.request(), first)
  await Promise.resolve()
  assert.equal(reads.length, 1)
  reads[0].resolve('latest')
  await first
  assert.deepEqual(values, ['latest'])
  queue.stop()
})

test('mutation invalidates old reads, merges paused requests and forces one post-write read', async () => {
  const { queue, load, reads, values } = harness()
  queue.start()
  const before = queue.request()
  await Promise.resolve()
  queue.invalidate()
  queue.configure(load, true)
  await queue.request(); await queue.request()
  assert.equal(reads.length, 1)
  const after = queue.request(true)
  await Promise.resolve()
  assert.equal(reads.length, 2)
  assert.equal(queue.request(), after)
  reads[1].resolve('saved')
  await after
  reads[0].resolve('stale')
  await before
  queue.configure(load, false); queue.flush()
  await Promise.resolve()
  assert.equal(reads.length, 2)
  assert.deepEqual(values, ['saved'])
  queue.stop()
})

test('edit defers refresh, failures are retryable, and disposed reads cannot publish or restart', async () => {
  const { queue, load, reads, values, errors } = harness()
  queue.configure(load, true); queue.start()
  await queue.request()
  assert.equal(reads.length, 0)
  queue.configure(load, false); queue.flush()
  const first = queue.request()
  await Promise.resolve()
  reads[0].reject(new Error('offline'))
  await first
  assert.deepEqual(errors, ['offline'])
  const retry = queue.request()
  await Promise.resolve()
  reads[1].resolve('recovered')
  await retry
  const last = queue.request()
  await Promise.resolve()
  queue.stop()
  reads[2].resolve('disposed')
  await last; await queue.request()
  assert.deepEqual(values, ['recovered'])
  assert.equal(reads.length, 3)
})
