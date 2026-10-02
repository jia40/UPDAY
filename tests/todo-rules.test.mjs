import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import ts from 'typescript'
import { initializeApp, deleteApp } from 'firebase/app'
import * as firestore from 'firebase/firestore'

// Run through Firebase emulators:exec; never connect these tests to production.
test('todo rules enforce owner access, atomic carry, permanent receipts and normal CRUD', {
  skip: !process.env.FIRESTORE_EMULATOR_HOST,
}, async () => {
  const { doc, setDoc, getDoc, getDocs, collection, query, where, updateDoc, deleteDoc, writeBatch, serverTimestamp } = firestore
  firestore.setLogLevel('silent')
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':')
  const apps = []
  function client(uid) {
    const app = initializeApp({ projectId: 'demo-upday' }, `${uid ?? 'anonymous'}-${Date.now()}`)
    apps.push(app)
    const db = firestore.getFirestore(app)
    firestore.connectFirestoreEmulator(db, host, Number(port), uid ? { mockUserToken: { sub: uid } } : {})
    return db
  }
  const db = client('owner'), other = client('other'), anonymous = client(null)
  const require = createRequire(import.meta.url)
  const source = readFileSync(new URL('../src/lib/todos.ts', import.meta.url), 'utf8')
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  const api = {}
  new Function('exports', 'require', output)(api, id => id === './firebase' ? { db } : id === 'firebase/firestore' ? firestore : require(id))
  const today = api.localDate()
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1)
  const past = api.localDate(yesterday)
  const deny = promise => assert.rejects(promise, error => error.code === 'permission-denied')
  const todo = (id, clientDb = db) => doc(clientDb, 'todos', id)
  const receipt = (id, clientDb = db) => doc(clientDb, 'users', 'owner', 'todoCarryovers', `${id}_${today}`)
  const copy = (sourceId, overrides = {}) => ({ userId: 'owner', title: sourceId, completed: false, date: today, createdAt: serverTimestamp(), sourceTodoId: sourceId, ...overrides })
  function batchCarry(sourceId, targetId, overrides = {}, clientDb = db) {
    const batch = writeBatch(clientDb)
    batch.set(todo(targetId, clientDb), copy(sourceId, overrides))
    batch.set(receipt(sourceId, clientDb), { sourceTodoId: sourceId, targetTodoId: targetId, date: today, createdAt: serverTimestamp() })
    return batch.commit()
  }
  try {
    const clear = await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/demo-upday/databases/(default)/documents`, { method: 'DELETE' })
    assert.equal(clear.ok, true)
    await api.createTodo('source', 'owner', past, 'source')
    assert.equal((await api.fetchTodos('owner', past)).length, 1)
    assert.equal((await api.fetchTodos('owner', '2000-01-01')).length, 0)
    assert.equal((await api.fetchCarriedTodoIds('owner', today)).size, 0)
    await deny(getDoc(todo('source', other)))
    await deny(getDoc(todo('source', anonymous)))
    await deny(getDocs(query(collection(other, 'todos'), where('userId', '==', 'owner'))))
    await deny(getDoc(receipt('source', other)))
    await deny(getDoc(receipt('source', anonymous)))
    await deny(getDocs(collection(other, 'users', 'owner', 'todoCarryovers')))
    await deny(setDoc(todo('unpaired'), copy('source')))
    await deny(setDoc(receipt('source'), { sourceTodoId: 'source', targetTodoId: 'missing', date: today, createdAt: serverTimestamp() }))
    await deny(batchCarry('source', 'wrong-title', { title: 'forged' }))
    await deny(batchCarry('source', 'stolen', {}, other))
    await api.createTodo('completed', 'owner', past, 'completed')
    await api.completeTodo('completed', true)
    await deny(batchCarry('completed', 'completed-copy'))
    await api.createTodo('current', 'owner', today, 'current')
    await deny(batchCarry('current', 'current-copy'))
    await deny(batchCarry('missing', 'missing-copy'))
    await api.carryTodos('owner', ['source', 'source'])
    const saved = (await getDoc(receipt('source'))).data()
    assert.equal((await getDoc(todo('source'))).data().date, past)
    assert.equal((await getDoc(todo(saved.targetTodoId))).data().sourceTodoId, 'source')
    assert.ok((await api.fetchCarriedTodoIds('owner', today)).has('source'))
    await api.renameTodo(saved.targetTodoId, 'renamed')
    await api.completeTodo(saved.targetTodoId, true)
    await deny(updateDoc(todo(saved.targetTodoId), { sourceTodoId: 'other' }))
    await deny(updateDoc(receipt('source'), { targetTodoId: 'replacement' }))
    await deny(deleteDoc(receipt('source')))
    await api.removeTodo(saved.targetTodoId)
    await api.carryTodos('owner', ['source'])
    assert.equal((await api.fetchTodos('owner', today)).some(item => item.id === saved.targetTodoId), false)
    await deny(batchCarry('source', 'duplicate'))
    await api.createTodo('partial', 'owner', past, 'partial')
    await assert.rejects(api.carryTodos('owner', ['partial', 'missing']))
    const firstTarget = (await getDoc(receipt('partial'))).data().targetTodoId
    await api.carryTodos('owner', ['partial'])
    assert.equal((await getDoc(receipt('partial'))).data().targetTodoId, firstTarget)
    await api.renameTodo('current', 'ordinary edit')
    await api.completeTodo('current', true)
    await api.removeTodo('current')
    assert.equal((await api.fetchTodos('owner', today)).some(item => item.id === 'current'), false)
  } finally {
    await Promise.all(apps.map(deleteApp))
  }
})
