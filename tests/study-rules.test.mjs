import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import ts from 'typescript'
import { initializeApp, deleteApp } from 'firebase/app'
import * as firestore from 'firebase/firestore'
import { backfill } from '../scripts/backfill-study-dates.mjs'

test('study owner queries, projection, migration and stable paged filters work against Firestore', { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async () => {
  const host = process.env.FIRESTORE_EMULATOR_HOST
  const project = 'demo-upday'
  const prefix = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents`
  const local = `http://${host}/v1/projects/${project}/databases/(default)/documents`
  const requests = []
  const request = async (url, options) => {
    assert.ok(url.startsWith(prefix))
    requests.push({ url, body: options.body ? JSON.parse(options.body) : null })
    const response = await fetch(url.replace(prefix, local), options)
    if (url.endsWith(':commit') && !response.ok) throw new Error(await response.text())
    return response
  }
  const userToken = uid => [Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url'), Buffer.from(JSON.stringify({ sub: uid, user_id: uid, aud: project, iss: `https://securetoken.google.com/${project}`, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600, firebase: { sign_in_provider: 'custom', identities: {} } })).toString('base64url'), ''].join('.')
  const token = userToken('study-owner')
  const app = initializeApp({ projectId: project }, 'study-pagination-test')
  const db = firestore.getFirestore(app)
  const [hostname, port] = host.split(':')
  firestore.connectFirestoreEmulator(db, hostname, Number(port), { mockUserToken: token })
  const require = createRequire(import.meta.url)
  const cache = new Map()
  function load(path) {
    const url = new URL(path, import.meta.url)
    if (cache.has(url.href)) return cache.get(url.href)
    const output = ts.transpileModule(readFileSync(url, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
    const exports = {}
    new Function('exports', 'require', 'fetch', output)(exports, id => {
      if (id === './firebase') return { db, auth: { currentUser: { uid: 'study-owner', getIdToken: async () => token } } }
      if (id === 'firebase/firestore') return firestore
      if (id.startsWith('.')) return load(new URL(`${id}.ts`, url).href)
      return require(id)
    }, request)
    cache.set(url.href, exports); return exports
  }
  try {
    const fields = (index, userId = 'study-owner') => ({ userId: { stringValue: userId }, title: { stringValue: `record ${index}` }, content: { stringValue: 'private long content' },
      studyDate: { stringValue: index < 30 ? '2026-09-30' : '2026-09-29' }, createdAt: { timestampValue: '2026-09-30T16:00:00Z' },
      studyMinutes: { integerValue: '30' }, tags: { arrayValue: { values: [{ stringValue: index % 2 ? 'React' : 'CS' }] } } })
    const writes = Array.from({ length: 45 }, (_, index) => ({ update: { name: `projects/${project}/databases/(default)/documents/studyLogs/study-${String(index).padStart(3, '0')}`, fields: fields(index) } }))
    const legacy = fields(99); delete legacy.studyDate
    writes.push({ update: { name: `projects/${project}/databases/(default)/documents/studyLogs/study-legacy`, fields: legacy } })
    writes.push({ update: { name: `projects/${project}/databases/(default)/documents/studyLogs/study-other`, fields: fields(1, 'other') } })
    const seeded = await request(`${prefix}:commit`, { method: 'POST', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: JSON.stringify({ writes }) })
    assert.equal(seeded.ok, true)
    const api = load('../src/lib/studyLogs.ts')
    for (const name of ['fetchStudyLog', 'fetchStudyOverview', 'fetchStudyPage']) {
      const original = api[name]
      api[name] = async (...args) => {
        try { return await original(...args) } catch (error) { error.message = `${name}(${JSON.stringify(args.slice(0, 3))}): ${error.message}`; throw error }
      }
    }
    assert.equal(await api.fetchStudyLog('study-owner', 'missing'), null)
    assert.equal(await api.fetchStudyLog('study-owner', 'study-other'), null)
    assert.equal((await api.fetchStudyLog('study-owner', 'study-001')).content, 'private long content')
    const overview = await api.fetchStudyOverview('study-owner')
    assert.equal(overview.length, 46)
    assert.equal(overview.some(item => 'content' in item || 'title' in item), false)
    assert.equal(overview.find(item => item.id === 'study-legacy').studyDate, undefined)
    assert.deepEqual(requests.at(-1).body.structuredQuery.select.fields.map(field => field.fieldPath), ['studyDate', 'createdAt', 'studyMinutes', 'tags'])
    await assert.rejects(api.fetchStudyPage('other', null, ''), error => error.code === 'permission-denied')
    const migrationNotes = []
    const migration = await backfill({ project, token: 'owner', apply: true, request, report: note => migrationNotes.push(note) })
    assert.equal(migration.updated, 1, migrationNotes.join('\n'))
    assert.equal((await api.fetchStudyLog('study-owner', 'study-legacy')).studyDate, '2026-10-01')
    assert.equal((await backfill({ project, token: 'owner', apply: true, request, report: () => {} })).updated, 0)
    const first = await api.fetchStudyPage('study-owner', null, '')
    const second = await api.fetchStudyPage('study-owner', null, '', first.cursor)
    const third = await api.fetchStudyPage('study-owner', null, '', second.cursor)
    assert.deepEqual([first.items.length, second.items.length, third.items.length], [20, 20, 6])
    assert.deepEqual([first.hasMore, second.hasMore, third.hasMore], [true, true, false])
    const ids = [...first.items, ...second.items, ...third.items].map(item => item.id)
    assert.equal(new Set(ids).size, 46)
    assert.equal(ids[0], 'study-legacy')
    assert.deepEqual(ids.slice(1), Array.from({ length: 45 }, (_, i) => `study-${String(i).padStart(3, '0')}`))
    const filtered = await api.fetchStudyPage('study-owner', '2026-09-30', 'React')
    assert.equal(filtered.items.length, 15); assert.equal(filtered.hasMore, false)
    assert.ok(filtered.items.every(item => item.studyDate === '2026-09-30' && item.tags.includes('React')))
    assert.equal((await api.fetchStudyPage('study-owner', '2000-01-01', '')).items.length, 0)
  } finally { await deleteApp(app) }
})
