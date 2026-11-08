import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import ts from 'typescript'
import { initializeApp, deleteApp } from 'firebase/app'
import * as firestore from 'firebase/firestore'

function loadNotes(sdk, db = {}) {
  const source = readFileSync(new URL('../src/lib/dailyNotes.ts', import.meta.url), 'utf8')
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  const api = {}
  new Function('exports', 'require', output)(api, id => {
    if (id === 'firebase/firestore') return sdk
    if (id === './firestore') return { db }
    if (id === './studyAnalytics') return { validateStudyDate: () => {} }
    throw new Error(`Unexpected module: ${id}`)
  })
  return api
}

test('daily note reads, retries and deletes the same date document; invalid text never writes', async () => {
  const writes = [], deletes = []
  let saved
  const api = loadNotes({
    doc: (_db, ...segments) => segments.join('/'), serverTimestamp: () => 'server-time',
    setDoc: async (path, data) => { writes.push([path, data]); saved = data },
    getDocFromServer: async () => ({ exists: () => saved !== undefined, data: () => saved }),
    deleteDoc: async path => { deletes.push(path); saved = undefined },
  })
  const date = '2024-02-29', path = `users/owner/dailyNotes/${date}`
  assert.equal(await api.fetchDailyNote('owner', date), '')
  for (const text of [' \u00a0\n ', '가'.repeat(201)]) await assert.rejects(api.saveDailyNote('owner', date, text), /1~200자/)
  assert.equal(writes.length, 0)
  await api.saveDailyNote('owner', date, ' 회고\r\n한 줄\u2028정리 ')
  await api.saveDailyNote('owner', date, '가'.repeat(200))
  assert.deepEqual(writes[0], [path, { date, text: '회고 한 줄 정리', updatedAt: 'server-time' }])
  assert.equal(writes[1][0], path)
  assert.equal((await api.fetchDailyNote('owner', date)).length, 200)
  await api.deleteDailyNote('owner', date)
  assert.deepEqual(deletes, [path])
  assert.equal(await api.fetchDailyNote('owner', date), '')
  saved = { text: 123 }
  await assert.rejects(api.fetchDailyNote('owner', date), /확인하지 못했습니다/)
})

test('daily note rules allow owner-only date documents and reject malformed writes', { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async () => {
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':')
  const apps = []
  const client = uid => {
    const app = initializeApp({ projectId: 'demo-upday' }, `daily-note-${uid ?? 'guest'}`)
    apps.push(app)
    const db = firestore.getFirestore(app)
    firestore.connectFirestoreEmulator(db, host, Number(port), uid ? { mockUserToken: { sub: uid } } : {})
    return db
  }
  const owner = client('note-owner'), other = client('note-other'), guest = client(null)
  const api = loadNotes(firestore, owner)
  const date = '2024-02-29'
  const ref = (db, dateId = date) => firestore.doc(db, 'users', 'note-owner', 'dailyNotes', dateId)
  const deny = action => assert.rejects(action, error => error.code === 'permission-denied')
  const valid = { date, text: '한 줄', updatedAt: firestore.serverTimestamp() }
  try {
    assert.equal(await api.fetchDailyNote('note-owner', date), '')
    await api.saveDailyNote('note-owner', date, '가'.repeat(200))
    await api.saveDailyNote('note-owner', date, '수정한 한 줄')
    assert.equal(await api.fetchDailyNote('note-owner', date), '수정한 한 줄')
    for (const db of [other, guest]) {
      await deny(firestore.getDocFromServer(ref(db)))
      await deny(firestore.setDoc(ref(db), valid))
      await deny(firestore.deleteDoc(ref(db)))
    }
    await deny(firestore.getDocsFromServer(firestore.collection(owner, 'users', 'note-owner', 'dailyNotes')))
    for (const patch of [{ text: '' }, { text: '\u00a0' }, { text: 'a\nb' }, { text: 'a\u2028b' }, { text: '가'.repeat(201) }, { date: '2024-02-28' }, { updatedAt: firestore.Timestamp.fromMillis(1) }, { extra: true }]) {
      await deny(firestore.setDoc(ref(owner), { ...valid, ...patch }))
    }
    for (const invalid of ['2025-02-29', '9999-12-31']) await deny(firestore.setDoc(ref(owner, invalid), { ...valid, date: invalid }))
    await api.deleteDailyNote('note-owner', date)
    await api.deleteDailyNote('note-owner', date)
    assert.equal(await api.fetchDailyNote('note-owner', date), '')
  } finally { await Promise.all(apps.map(deleteApp)) }
})
