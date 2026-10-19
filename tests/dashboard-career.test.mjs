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
      if (id.endsWith('.css')) return {}
      if (id.startsWith('.')) return load(new URL(id, url).href)
      return require(id)
    })
    cache.set(url.href, exports)
    return exports
  }
  return load
}
const originalFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = originalFetch })
function statsApi(currentUser = { uid: 'owner', getIdToken: async () => 'token' }) {
  return loader({ './firebase': { auth: { currentUser }, db: { app: { options: { projectId: 'demo-upday' } } } } })('../src/lib/dashboardStats.ts')
}
const response = fields => ({ ok: true, json: async () => fields.map(item => ({ document: { fields: item } })) })
test('interview projection matches review rule and excludes answer; job projection counts every status', async () => {
  const requests = []
  globalThis.fetch = async (_url, options) => {
    const q = JSON.parse(options.body).structuredQuery; requests.push(q)
    return q.from[0].collectionId === 'interviewQuestions' ? response([
      { status: { stringValue: 'unknown' }, lastReviewedAt: { nullValue: null } },
      { status: { stringValue: 'learning' }, lastReviewedAt: { timestampValue: '2026-10-12T00:00:00Z' } },
      { status: { stringValue: 'learning' }, lastReviewedAt: { timestampValue: '2026-10-18T00:00:00Z' } },
      { status: { stringValue: 'explainable' }, lastReviewedAt: { nullValue: null } },
    ]) : response(['interested','planned','applied','screening','coding','interview','accepted','rejected'].map(status => ({ status: { stringValue: status } })))
  }
  const api = statsApi()
  assert.equal(await api.fetchInterviewStats('owner', '2026-10-19'), 2)
  assert.deepEqual(await api.fetchJobStats('owner'), { applied: 6, screening: 1, interview: 1 })
  assert.deepEqual(requests[0].select.fields, [{ fieldPath: 'status' }, { fieldPath: 'lastReviewedAt' }])
  assert.deepEqual(requests[1].select.fields, [{ fieldPath: 'status' }])
  assert.equal(requests[0].where.fieldFilter.value.stringValue, 'owner')
})
test('empty data returns zero, unauthorized accounts never fetch, and token expiry retries once', async () => {
  let calls = 0
  globalThis.fetch = async () => { calls++; return calls === 1 ? { ok: false, status: 401 } : { ok: true, json: async () => [{ readTime: 'now' }] } }
  const tokens = []
  const api = statsApi({ uid: 'owner', getIdToken: async refresh => { tokens.push(refresh); return 'token' } })
  assert.equal(await api.fetchInterviewStats('owner', '2026-10-19'), 0)
  assert.deepEqual(tokens, [false, true])
  assert.deepEqual(await api.fetchJobStats('owner'), { applied: 0, screening: 0, interview: 0 })
  const before = calls
  await assert.rejects(statsApi(null).fetchJobStats('owner'))
  await assert.rejects(api.fetchJobStats('other'))
  assert.equal(calls, before)
  globalThis.fetch = async () => ({ ok: false, status: 403 })
  await assert.rejects(api.fetchJobStats('owner'), e => e.code === 'permission-denied')
  globalThis.fetch = async () => response([{ status: { stringValue: 'invalid' } }])
  await assert.rejects(api.fetchJobStats('owner'))
})
function card(fetchInterviewStats, fetchJobStats = async () => ({ applied: 0, screening: 0, interview: 0 })) {
  return loader({ '../lib/dashboardStats': { fetchInterviewStats, fetchJobStats } })('../src/components/DashboardCareerCard.tsx').default
}
test('cards show real zero, separate errors and retry recovery', async () => {
  let fail = true
  const Card = card(async () => { if (fail) throw new Error('network'); return 0 })
  const view = render(createElement(Card, { kind: 'interview', userId: 'owner', date: '2026-10-19' }))
  assert.ok(view.getByRole('status'))
  await view.findByRole('alert')
  assert.equal(view.queryByText('0개'), null)
  fail = false
  fireEvent.click(view.getByRole('button', { name: '다시 불러오기' }))
  await view.findByText('0개')
  assert.equal(view.queryByRole('alert'), null)
  view.unmount()
  const job = render(createElement(Card, { kind: 'job', userId: 'owner', date: '2026-10-19' }))
  await waitFor(() => assert.equal(job.getAllByText('0').length, 3))
})
test('account and date changes discard old responses and event refreshes are coalesced', async () => {
  const pending = []
  const Card = card((uid, date) => new Promise(resolve => pending.push({ uid, date, resolve })))
  const props = { kind: 'interview', userId: 'owner', date: '2026-10-19' }
  const view = render(createElement(Card, props))
  act(() => { window.dispatchEvent(new window.Event('focus')); window.dispatchEvent(new window.Event('online')) })
  assert.equal(pending.length, 1)
  view.rerender(createElement(Card, { ...props, userId: 'other' }))
  assert.equal(pending.length, 2)
  await act(async () => pending[0].resolve(99))
  assert.equal(view.queryByText('99개'), null)
  await act(async () => pending[1].resolve(2))
  assert.ok(view.getByText('2개'))
  view.rerender(createElement(Card, { ...props, userId: 'other', date: '2026-10-20' }))
  assert.equal(view.queryByText('2개'), null)
  await act(async () => pending[2].resolve(3))
  assert.ok(view.getByText('3개'))
  act(() => window.dispatchEvent(new window.Event('focus')))
  assert.equal(pending.length, 4)
  await act(async () => pending[3].resolve(4))
  assert.ok(view.getByText('4개'))
})
