import { readFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import ts from 'typescript'
import { JSDOM } from 'jsdom'

const require = createRequire(import.meta.url)
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/study' })
globalThis.window = dom.window
globalThis.document = dom.window.document
globalThis.HTMLElement = dom.window.HTMLElement
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator })
globalThis.IS_REACT_ACT_ENVIRONMENT = true
const { render, fireEvent, waitFor, cleanup, within, act } = await import('@testing-library/react')
const { createElement } = await import('react')
afterEach(() => { cleanup(); window.history.replaceState({}, '', '/study') })

function loader(mocks = {}) {
  const cache = new Map()
  function load(path) {
    let url = new URL(path, import.meta.url)
    if (!/\.(tsx?|mjs)$/.test(url.pathname)) url = new URL(url.href + (existsSync(new URL(url.href + '.tsx')) ? '.tsx' : '.ts'))
    if (cache.has(url.href)) return cache.get(url.href)
    const output = ts.transpileModule(readFileSync(url, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText
    const exports = {}
    new Function('exports', 'require', output)(exports, (id) => {
      if (id in mocks) return mocks[id]
      if (id === './firestore' && mocks['./firebase']) return mocks['./firebase']
      if (id.endsWith('.css')) return {}
      if (id.startsWith('.')) return load(new URL(id, url).href)
      return require(id)
    })
    cache.set(url.href, exports)
    return exports
  }
  return load
}
test('cache hits, TTL expiry, concurrent sharing, force refresh and user isolation', async () => {
  const { cachedStudyOverview: get, STUDY_OVERVIEW_TTL_MS } = loader()('../src/lib/studyOverviewCache.ts')
  const originalNow = Date.now
  let now = 100, calls = 0
  Date.now = () => now
  const load = async () => { calls++; return [{ id: String(calls) }] }
  try {
    const [a, b] = await Promise.all([get('a', load), get('a', load)])
    assert.equal(calls, 1); assert.equal(a, b)
    await get('a', load); assert.equal(calls, 1)
    now += STUDY_OVERVIEW_TTL_MS - 1
    await get('a', load); assert.equal(calls, 1)
    now++
    await get('a', load); assert.equal(calls, 2)
    await Promise.all([get('a', load, true), get('a', load, true)])
    assert.equal(calls, 3)
    await get('b', load); assert.equal(calls, 4)
  } finally { Date.now = originalNow }
})
test('invalidation prevents late result caching and old callers join the new generation', async () => {
  const { cachedStudyOverview: get, invalidateStudyOverview: invalidate } = loader()('../src/lib/studyOverviewCache.ts')
  let oldFinish, newFinish, calls = 0
  const load = () => { calls++; return new Promise(resolve => { if (calls === 1) oldFinish = resolve; else newFinish = resolve }) }
  const old = get('owner', load)
  await Promise.resolve()
  invalidate('owner')
  const latest = get('owner', load)
  await Promise.resolve()
  oldFinish([{ id: 'old' }]); newFinish([{ id: 'new' }])
  assert.deepEqual(await old, [{ id: 'new' }])
  assert.deepEqual(await latest, [{ id: 'new' }])
  assert.deepEqual(await get('owner', load), [{ id: 'new' }])
  assert.equal(calls, 2)
})
test('failed queries are not cached and clear removes every account generation', async () => {
  const { cachedStudyOverview: get, invalidateStudyOverview: invalidate } = loader()('../src/lib/studyOverviewCache.ts')
  let calls = 0
  const load = async () => { calls++; if (calls === 1) throw new Error('network'); return [] }
  await assert.rejects(get('a', load), /network/)
  await get('a', load); assert.equal(calls, 2)
  await get('b', load)
  invalidate()
  await get('a', load); await get('b', load)
  assert.equal(calls, 5)
})
const originalFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = originalFetch })
function library() {
  const user = { uid: 'owner', getIdToken: async () => 'token' }
  const auth = { currentUser: user }
  const load = loader({ './firebase': { auth, db: { app: { options: { projectId: 'demo-upday' } } } }, 'firebase/firestore': {
    ...require('firebase/firestore'), collection: (_db, name) => name, doc: (...args) => args.join('/'), serverTimestamp: () => 'server',
    setDoc: async () => {}, updateDoc: async () => {}, deleteDoc: async () => {},
  } })
  return { api: load('../src/lib/studyLogs.ts'), auth, user }
}
const input = { title: 'title', content: 'content', tags: '', studyMinutes: '30', studyDate: '2024-02-29' }
test('public overview reuses projection and successful CRUD invalidates cache', async () => {
  let requests = 0
  globalThis.fetch = async () => { requests++; return { ok: true, json: async () => [] } }
  const { api, auth } = library()
  await Promise.all([api.fetchStudyOverview('owner'), api.fetchStudyOverview('owner')])
  await api.fetchStudyOverview('owner'); assert.equal(requests, 1)
  await api.createStudyLog('a', 'owner', input)
  await api.fetchStudyOverview('owner'); assert.equal(requests, 2)
  await api.updateStudyLog('a', input)
  await api.fetchStudyOverview('owner'); assert.equal(requests, 3)
  await api.deleteStudyLog('a')
  await api.fetchStudyOverview('owner'); assert.equal(requests, 4)
  await api.fetchStudyOverview('owner', { force: true }); assert.equal(requests, 5)
  auth.currentUser = null
  await assert.rejects(api.fetchStudyOverview('owner'), error => error.code === 'permission-denied')
  assert.equal(requests, 5)
})
test('late network response after account switch is rejected rather than cached', async () => {
  let finish
  globalThis.fetch = () => new Promise(resolve => { finish = resolve })
  const { api, auth } = library()
  const pending = api.fetchStudyOverview('owner')
  await waitFor(() => assert.ok(finish))
  auth.currentUser = { uid: 'other' }
  finish({ ok: true, json: async () => [] })
  await assert.rejects(pending, error => error.code === 'permission-denied')
})
