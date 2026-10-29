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
function library(rows = []) {
  const queries = []
  const api = loader({ './firestore': { db: {} }, 'firebase/firestore': {
    collection: (_db, name) => name, where: (...args) => args, query: (...args) => args,
    getDocsFromServer: async q => { queries.push(q); return { docs: rows.map(row => ({ data: () => row })) } },
  } })('../src/lib/todayStudy.ts')
  return { api, queries }
}
test('daily study query selects owner and study date and sums all matching records', async () => {
  const { api, queries } = library([30, 60, 15].map(studyMinutes => ({ userId: 'owner', studyDate: '2024-02-29', studyMinutes })))
  assert.equal(await api.fetchDailyStudyMinutes('owner', '2024-02-29'), 105)
  assert.deepEqual(queries[0], ['studyLogs', ['userId', '==', 'owner'], ['studyDate', '==', '2024-02-29']])
  assert.equal(await library().api.fetchDailyStudyMinutes('owner', '2024-02-29'), 0)
  await assert.rejects(api.fetchDailyStudyMinutes('owner', '2025-02-29'))
  await assert.rejects(library([{ userId: 'other', studyDate: '2024-02-29', studyMinutes: 30 }]).api.fetchDailyStudyMinutes('owner', '2024-02-29'))
})
test('Study deep-link dates validate past days and fall back for invalid or future dates', () => {
  const { studyDateFromSearch, formatStudyTime } = loader()('../src/lib/studyAnalytics.ts')
  assert.equal(studyDateFromSearch('?date=2024-02-29', '2026-10-20'), '2024-02-29')
  for (const search of ['', '?date=2025-02-29', '?date=2026-10-21']) assert.equal(studyDateFromSearch(search, '2026-10-20'), null)
  assert.equal(formatStudyTime(105), '1시간 45분')
})
function component(fetchDailyStudyMinutes) { return loader({ '../lib/todayStudy': { fetchDailyStudyMinutes } })('../src/components/TodayStudySummary.tsx').default }
test('summary displays zero; failures are retriable rather than zero', async () => {
  let fail = true
  const Summary = component(async () => { if (fail) throw new Error('network'); return 0 })
  const view = render(createElement(Summary, { userId: 'owner', date: '2026-10-19' }))
  assert.ok(view.getByRole('status'))
  await view.findByRole('alert')
  assert.equal(view.queryByText('0분'), null)
  fail = false
  fireEvent.click(view.getByRole('button', { name: '학습 시간 다시 불러오기' }))
  await view.findByText('0분')
})
test('date and account transitions ignore old results; tab return refreshes without duplicate requests', async () => {
  const pending = []
  const Summary = component((uid, date) => new Promise(resolve => pending.push({ uid, date, resolve })))
  const view = render(createElement(Summary, { userId: 'owner', date: '2026-10-19' }))
  act(() => { window.dispatchEvent(new window.Event('focus')); window.dispatchEvent(new window.Event('online')) })
  assert.equal(pending.length, 1)
  view.rerender(createElement(Summary, { userId: 'owner', date: '2026-10-20' }))
  await act(async () => pending[0].resolve(99))
  assert.equal(view.queryByText('1시간 39분'), null)
  await act(async () => pending[1].resolve(105))
  assert.ok(view.getByText('1시간 45분'))
  view.rerender(createElement(Summary, { userId: 'other', date: '2026-10-20' }))
  assert.equal(view.queryByText('1시간 45분'), null)
  await act(async () => pending[2].resolve(5))
  act(() => window.dispatchEvent(new window.Event('focus')))
  await act(async () => pending[3].resolve(10))
  assert.ok(view.getByText('10분'))
})
