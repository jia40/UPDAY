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
const { Timestamp } = require('firebase/firestore')
const metadata = (id, status = 'unknown', tag = 'React') => ({ id, status, tags: [tag], lastReviewedAt: null, createdAt: new Timestamp(1700000000, 123456789) })
const fields = item => ({ status: { stringValue: item.status }, tags: { arrayValue: { values: item.tags.map(stringValue => ({ stringValue })) } }, lastReviewedAt: { nullValue: null }, createdAt: { timestampValue: item.createdAt.toDate().toISOString().replace('123Z', '123456789Z') }, question: { stringValue: '질문 ' + item.id } })
function api() { return loader({ './firebase': { auth: { currentUser: { uid: 'owner', getIdToken: async () => 'token' } }, db: { app: { options: { projectId: 'demo-upday' } } } } })('../src/lib/interviewPagination.ts') }
function server(records) {
  const queries = []
  globalThis.fetch = async (_url, options) => {
    const q = JSON.parse(options.body).structuredQuery; queries.push(q)
    const selected = q.where.compositeFilter?.filters[1].fieldFilter.value.arrayValue.values.map(value => value.referenceValue.split('/').at(-1))
    const rows = records.filter(item => !selected || selected.includes(item.id)).slice().reverse()
    return { ok: true, json: async () => rows.map(item => ({ document: { name: 'projects/demo-upday/databases/(default)/documents/interviewQuestions/' + item.id, fields: fields(item) } })) }
  }
  return queries
}
test('metadata excludes question/answer and preserves nanosecond ordering', async () => {
  const queries = server([metadata('a')])
  const overview = await api().fetchInterviewOverview('owner')
  assert.equal(overview[0].createdAt.nanoseconds, 123456789)
  assert.deepEqual(queries[0].select.fields.map(field => field.fieldPath), ['tags','status','lastReviewedAt','createdAt'])
  assert.equal(queries[0].where.fieldFilter.value.stringValue, 'owner')
})
test('21-item lookahead, deterministic ordering and cursor load all pages without answers', async () => {
  const records = Array.from({ length: 45 }, (_, i) => metadata(String(i).padStart(2, '0')))
  const queries = server(records)
  const library = api(), filters = { status: '', tag: '', reviewOnly: false }
  const first = await library.fetchInterviewPage('owner', filters, '2026-10-24', undefined, records)
  assert.equal(first.items.length, 20); assert.equal(first.hasMore, true); assert.equal(first.cursor.id, '19')
  const second = await library.fetchInterviewPage('owner', filters, '2026-10-24', first.cursor, records)
  const third = await library.fetchInterviewPage('owner', filters, '2026-10-24', second.cursor, records)
  assert.equal(third.items.length, 5); assert.equal(third.hasMore, false)
  assert.equal(new Set([...first.items, ...second.items, ...third.items].map(item => item.id)).size, 45)
  assert.equal(queries[0].where.compositeFilter.filters[1].fieldFilter.value.arrayValue.values.length, 21)
  assert.ok(queries.every(q => !q.select.fields.some(f => f.fieldPath === 'answer')))
})
test('filters apply across all metadata, including questions beyond the first page', async () => {
  const records = Array.from({ length: 35 }, (_, i) => metadata(String(i).padStart(2, '0'), i === 34 ? 'learning' : 'explainable', i === 34 ? 'CS' : 'React'))
  server(records)
  const page = await api().fetchInterviewPage('owner', { status: 'learning', tag: 'CS', reviewOnly: true }, '2026-10-24', undefined, records)
  assert.deepEqual(page.items.map(item => item.id), ['34'])
  assert.equal(page.hasMore, false)
})
test('deleted page entries advance cursor and failed response remains an error', async () => {
  const records = Array.from({ length: 25 }, (_, i) => metadata(String(i).padStart(2, '0')))
  server(records.slice(20))
  const library = api(), filters = { status: '', tag: '', reviewOnly: false }
  const first = await library.fetchInterviewPage('owner', filters, '2026-10-24', undefined, records)
  assert.equal(first.items.length, 0); assert.equal(first.cursor.id, '19'); assert.equal(first.hasMore, true)
  const next = await library.fetchInterviewPage('owner', filters, '2026-10-24', first.cursor, records)
  assert.equal(next.items.length, 5)
  globalThis.fetch = async () => ({ ok: false, status: 403 })
  await assert.rejects(library.fetchInterviewOverview('owner'), error => error.code === 'permission-denied')
})

test('more failure retains existing items and retries the identical cursor', async () => {
  const records = Array.from({ length: 25 }, (_, i) => ({ ...metadata(String(i).padStart(2, '0')), question: '질문 ' + i }))
  let fail = true
  const calls = []
  const List = loader({ './firebase': { db: {} }, '../lib/interviewPagination': { fetchInterviewPage: async (_uid, _filters, _today, cursor) => {
    calls.push(cursor?.id)
    if (cursor && fail) throw new Error('추가 조회 실패')
    return cursor ? { items: records.slice(20), hasMore: false, cursor: records.at(-1) } : { items: records.slice(0,20), hasMore: true, cursor: records[19] }
  } } })('../src/components/InterviewPageList.tsx').default
  const view = render(createElement(List, { userId: 'owner', filters: { status: '', tag: '', reviewOnly: false }, today: '2026-10-24', overview: records }))
  await view.findByText('현재 20개 표시')
  fireEvent.click(view.getByRole('button', { name: '더 보기' }))
  await view.findByText('추가 조회 실패')
  assert.equal(view.getAllByRole('link').length, 20)
  fail = false
  fireEvent.click(view.getByRole('button', { name: '질문 다시 불러오기' }))
  await view.findByText('현재 25개 표시')
  assert.deepEqual(calls, [undefined, '19', '19'])
  assert.equal(view.queryByRole('button', { name: '더 보기' }), null)
})
test('old unmounted page response cannot appear in the new account list', async () => {
  let finish
  const List = loader({ './firebase': { db: {} }, '../lib/interviewPagination': { fetchInterviewPage: async uid => uid === 'owner' ? new Promise(resolve => { finish = resolve }) : { items: [{ ...metadata('other'), question: '다른 사용자 질문' }], hasMore: false } } })('../src/components/InterviewPageList.tsx').default
  const props = { filters: { status: '', tag: '', reviewOnly: false }, today: '2026-10-24', overview: [] }
  const view = render(createElement(List, { ...props, userId: 'owner', key: 'owner' }))
  view.rerender(createElement(List, { ...props, userId: 'other', key: 'other' }))
  await view.findByText('다른 사용자 질문')
  await act(async () => finish({ items: [{ ...metadata('old'), question: '이전 사용자 질문' }], hasMore: false }))
  assert.equal(view.queryByText('이전 사용자 질문'), null)
})
