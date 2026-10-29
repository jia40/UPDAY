import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import ts from 'typescript'
const require = createRequire(import.meta.url)
function library({ saved = null, writeError = null, readError = null } = {}) {
  const calls = { writes: [], reads: [] }
  const source = readFileSync(new URL('../src/lib/todos.ts', import.meta.url), 'utf8')
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  const api = {}
  new Function('exports', 'require', output)(api, id => id === './firestore' ? { db: {} } : id === 'firebase/firestore' ? {
    collection: (_db, name) => name, doc: (...args) => args.slice(1).join('/'), serverTimestamp: () => 'server',
    query: (...args) => args, where: (...args) => args, documentId: () => '__name__', limit: n => ['limit', n],
    setDoc: async (...args) => { calls.writes.push(args); if (writeError) throw writeError },
    getDocsFromServer: async q => { calls.reads.push(q); if (readError) throw readError; return { docs: saved ? [{ id: 'id', data: () => saved }] : [] } },
  } : require(id))
  return { api, calls }
}
const record = { userId: 'owner', title: '할 일', date: '2026-10-14', completed: false, createdAt: 'original' }
const save = api => api.createTodo('id', 'owner', '2026-10-14', ' 할 일 ')
test('normal todo creation validates before write and performs no verification read', async () => {
  const { api, calls } = library()
  await save(api)
  assert.deepEqual(calls.writes, [['todos/id', { ...record, createdAt: 'server' }]])
  assert.equal(calls.reads.length, 0)
  await assert.rejects(api.createTodo('id', 'owner', record.date, ' '))
  assert.equal(calls.writes.length, 1)
})
test('lost acknowledgement reconciles by owner and ID without rewriting completion or creation time', async () => {
  for (const completed of [false, true]) {
    const saved = { ...record, completed }
    const { api, calls } = library({ saved, writeError: new Error('network') })
    await save(api)
    assert.equal(calls.writes.length, 1)
    assert.deepEqual(calls.reads, [['todos', ['userId', '==', 'owner'], ['__name__', '==', 'id'], ['limit', 1]]])
    assert.equal(saved.completed, completed)
    assert.equal(saved.createdAt, 'original')
  }
})
test('different saved title, date or owner is a conflict and is never overwritten', async () => {
  const cause = new Error('network')
  for (const change of [{ title: '変更' }, { date: '2026-10-13' }, { userId: 'other' }]) {
    const { api, calls } = library({ saved: { ...record, ...change }, writeError: cause })
    await assert.rejects(save(api), error => /이미 저장/.test(error.message) && error.cause === cause)
    assert.equal(calls.writes.length, 1)
  }
})
test('missing record and failed verification preserve the original write error', async () => {
  const error = new Error('original write error')
  for (const readError of [null, new Error('read failure')]) {
    const { api, calls } = library({ writeError: error, readError })
    await assert.rejects(save(api), reason => reason === error)
    assert.equal(calls.writes.length, 1)
  }
})
