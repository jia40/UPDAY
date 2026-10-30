import { readFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import ts from 'typescript'
import { JSDOM } from 'jsdom'
import { backfill, dateInZone } from '../scripts/backfill-study-dates.mjs'
const require = createRequire(import.meta.url)
const dom = new JSDOM('<html><body></body></html>', { url: 'http://localhost/study' })
globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.HTMLElement = dom.window.HTMLElement
globalThis.IS_REACT_ACT_ENVIRONMENT = true
const { render, fireEvent, waitFor, cleanup, act } = await import('@testing-library/react')
const { createElement } = await import('react')
afterEach(cleanup)
function loader(mocks) {
  const cache = new Map()
  function load(path) {
    let url = new URL(path, import.meta.url)
    if (!/\.tsx?$/.test(url.pathname)) url = new URL(url.href + (existsSync(new URL(url.href + '.tsx')) ? '.tsx' : '.ts'))
    if (cache.has(url.href)) return cache.get(url.href)
    const output = ts.transpileModule(readFileSync(url, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText
    const exports = {}
    new Function('exports', 'require', output)(exports, id => {
      if (id in mocks) return mocks[id]
      if (id.startsWith('.')) return load(new URL(id, url).href)
      return require(id)
    })
    cache.set(url.href, exports); return exports
  }
  return load
}
const record = id => ({ id, title: id, studyDate: '2026-09-30', studyMinutes: 30, tags: [] })

test('page keeps existing records on failure, retries the same cursor, and stops at last page', async () => {
  const calls = []; let fail = true, finish
  const List = loader({ '../lib/studyLogs': { fetchStudyPage: async (...args) => {
    calls.push(args)
    if (!args[3]) return { items: [record('first')], cursor: 'cursor1', hasMore: true }
    if (fail) throw new Error('offline')
    return new Promise(resolve => { finish = () => resolve({ items: [record('second')], cursor: 'cursor2', hasMore: false }) })
  } } })('../src/components/StudyRecordList.tsx').default
  const view = render(createElement(List, { userId: 'owner', date: null, tag: '' }))
  await view.findByRole('link', { name: /first/ })
  fireEvent.click(view.getByRole('button', { name: '더 보기' }))
  await view.findByRole('alert')
  assert.ok(view.getByRole('link', { name: /first/ }))
  fail = false
  fireEvent.click(view.getByRole('button', { name: '목록 다시 불러오기' }))
  assert.deepEqual(calls.at(-1), ['owner', null, '', 'cursor1'])
  assert.ok(view.getByText('학습 기록을 불러오고 있습니다.'))
  await act(async () => finish())
  assert.equal(view.getAllByRole('link').length, 2)
  assert.equal(view.queryByRole('button', { name: '더 보기' }), null)
})

test('filter remount resets cursor and ignores late results from the previous filter', async () => {
  const calls = []; let finish
  const List = loader({ '../lib/studyLogs': { fetchStudyPage: async (...args) => {
    calls.push(args)
    if (args[3]) return new Promise(resolve => { finish = resolve })
    return { items: [record(args[2] || 'unfiltered')], cursor: 'old-cursor', hasMore: true }
  } } })('../src/components/StudyRecordList.tsx').default
  const view = render(createElement(List, { key: 'all', userId: 'owner', date: null, tag: '' }))
  await view.findByRole('link', { name: /unfiltered/ })
  fireEvent.click(view.getByRole('button', { name: '더 보기' }))
  view.rerender(createElement(List, { key: 'React', userId: 'owner', date: '2026-09-30', tag: 'React' }))
  await view.findByRole('link', { name: /React/ })
  await act(async () => finish({ items: [record('stale')], hasMore: false }))
  assert.equal(view.queryByRole('link', { name: /stale/ }), null)
  assert.deepEqual(calls.at(-1), ['owner', '2026-09-30', 'React'])
})

test('first page failure is retryable and is not presented as an empty list', async () => {
  let fail = true
  const List = loader({ '../lib/studyLogs': { fetchStudyPage: async () => {
    if (fail) throw new Error('offline')
    return { items: [], hasMore: false }
  } } })('../src/components/StudyRecordList.tsx').default
  const view = render(createElement(List, { userId: 'owner', date: null, tag: '' }))
  await view.findByRole('alert')
  assert.equal(view.queryByText(/아직 학습 기록이 없어요/), null)
  fail = false; fireEvent.click(view.getByRole('button', { name: '목록 다시 불러오기' }))
  await waitFor(() => assert.ok(view.getByText(/아직 학습 기록이 없어요/)))
})

test('migration uses Korea dates, defaults to dry run, and preserves existing dates', async () => {
  assert.equal(dateInZone('2026-09-30T16:00:00Z'), '2026-10-01')
  const calls = []
  const documents = [
    { name: 'projects/demo-upday/databases/(default)/documents/studyLogs/legacy', updateTime: '2026-10-01T00:00:00Z', fields: { createdAt: { timestampValue: '2026-09-30T16:00:00Z' } } },
    { name: 'projects/demo-upday/databases/(default)/documents/studyLogs/modern', fields: { studyDate: { stringValue: '2024-01-01' } } },
  ]
  const request = async (url, options) => {
    calls.push({ url, options })
    return { ok: true, json: async () => documents.map(document => ({ document })) }
  }
  const options = { project: 'demo-upday', token: 'test-token', report: () => {}, request }
  const dry = await backfill(options)
  assert.equal(dry.candidates, 1); assert.equal(dry.updated, 0); assert.equal(calls.length, 1)
  const applied = await backfill({ ...options, apply: true })
  assert.equal(applied.updated, 1)
  const commit = calls.find(call => call.url.endsWith(':commit'))
  const write = JSON.parse(commit.options.body).writes[0]
  assert.deepEqual(write.currentDocument, { updateTime: '2026-10-01T00:00:00Z' })
  assert.deepEqual(write.updateMask, { fieldPaths: ['studyDate'] })
  assert.deepEqual(write.update.fields, { studyDate: { stringValue: '2026-10-01' } })
})

test('migration reports concurrent changes and invalid timestamps instead of overwriting', async () => {
  const documents = [
    { name: 'projects/demo-upday/databases/(default)/documents/studyLogs/one', updateTime: '2026-10-01T00:00:00Z', fields: { createdAt: { timestampValue: '2026-09-30T00:00:00Z' } } },
    { name: 'projects/demo-upday/databases/(default)/documents/studyLogs/bad', fields: {} },
  ]
  const result = await backfill({ project: 'demo-upday', token: 'test', apply: true, report: () => {}, request: async url => url.endsWith(':runQuery')
    ? { ok: true, json: async () => documents.map(document => ({ document })) }
    : { ok: false, status: 409 } })
  assert.equal(result.updated, 0); assert.equal(result.failed, 2)
})

test('legacy metadata pages include undated records with owner restriction, stable order and intersected filters', async () => {
  const { Timestamp } = require('firebase/firestore')
  const overview = Array.from({ length: 23 }, (_, index) => ({
    id: String(index).padStart(2, '0'), tags: ['React'], studyMinutes: 30,
    createdAt: Timestamp.fromDate(new Date('2026-09-30T12:00:00')),
    ...(index % 2 ? { studyDate: '2026-09-30' } : {}),
  }))
  const calls = []
  const api = loader({ './firestore': { db: {} }, './firebase': { auth: {} }, 'firebase/firestore': {
    collection: () => 'studyLogs', documentId: () => '__name__', where: (...args) => args, query: (...args) => args,
    getDocsFromServer: async q => {
      calls.push(q)
      return { docs: [...q[2][2]].reverse().map(id => ({ id, data: () => ({ ...record(id), userId: 'owner' }) })) }
    },
  } })('../src/lib/studyLogs.ts')
  const first = await api.fetchLegacyStudyPage('owner', '2026-09-30', 'React', overview)
  assert.deepEqual(first.items.map(item => item.id), overview.slice(0, 20).map(item => item.id))
  assert.equal(first.hasMore, true)
  assert.deepEqual(calls[0][1], ['userId', '==', 'owner'])
  assert.equal(calls[0][2][2].length, 20)
  const last = await api.fetchLegacyStudyPage('owner', null, '', overview, first.cursor)
  assert.deepEqual(last.items.map(item => item.id), ['20', '21', '22'])
  assert.equal(last.hasMore, false)
  const count = calls.length
  assert.equal((await api.fetchLegacyStudyPage('owner', null, 'Other', overview)).items.length, 0)
  assert.equal((await api.fetchLegacyStudyPage('owner', '2026-09-29', 'React', overview)).items.length, 0)
  assert.equal(calls.length, count)
  await assert.rejects(api.fetchLegacyStudyPage('owner', null, '', overview, { legacyId: 'deleted' }))
})

test('legacy pagination skips deleted metadata pages and propagates failures for retry', async () => {
  const { Timestamp } = require('firebase/firestore')
  const overview = Array.from({ length: 21 }, (_, i) => ({ ...record(String(i).padStart(2, '0')), createdAt: Timestamp.fromMillis(1) }))
  let requests = 0, fail = true
  const api = loader({ './firestore': { db: {} }, './firebase': { auth: {} }, 'firebase/firestore': {
    collection: () => 'studyLogs', documentId: () => '__name__', where: (...args) => args, query: (...args) => args,
    getDocsFromServer: async () => {
      requests++
      if (fail) throw new Error('offline')
      return { docs: requests === 2 ? [] : [{ id: '20', data: () => record('20') }] }
    },
  } })('../src/lib/studyLogs.ts')
  await assert.rejects(api.fetchLegacyStudyPage('owner', null, '', overview), /offline/)
  fail = false
  const page = await api.fetchLegacyStudyPage('owner', null, '', overview)
  assert.deepEqual(page.items.map(item => item.id), ['20'])
  assert.equal(page.hasMore, false)
})

test('StudyList routes mixed legacy metadata to compatibility pages and returns to normal pages after backfill', () => {
  const { Timestamp } = require('firebase/firestore')
  const calls = []
  const List = loader({
    '../hooks/useToday': { useToday: () => '2026-10-29' },
    './StudyHeatmap': { __esModule: true, default: () => null }, './StudyWeeklyStats': { __esModule: true, default: () => null }, './StudyMonthlyStats': { __esModule: true, default: () => null },
    './StudyRecordList': { __esModule: true, default: props => { calls.push(props); return createElement('p', null, 'records') } },
  })('../src/components/StudyList.tsx').default
  const overview = [{ ...record('old'), studyDate: undefined, createdAt: Timestamp.fromDate(new Date('2026-09-30T00:00:00Z')) }]
  const props = { userId: 'owner', overview, revision: 0, loading: false, error: '', reload: () => {} }
  const view = render(createElement(List, props))
  assert.equal(view.queryByRole('alert'), null)
  assert.equal(calls.at(-1).legacyOverview, overview)
  view.rerender(createElement(List, { ...props, overview: overview.map(item => ({ ...item, studyDate: '2026-09-30' })), revision: 1 }))
  assert.equal(calls.at(-1).legacyOverview, undefined)
})

test('backfill reports malformed dates and embedded query errors without false success', async () => {
  const options = { project: 'demo-upday', token: 'test', report: () => {} }
  const result = await backfill({ ...options, request: async () => ({ ok: true, json: async () => [
    { document: { name: 'projects/demo-upday/databases/(default)/documents/studyLogs/bad', fields: { studyDate: { stringValue: '2025-02-29' } } } },
  ] }) })
  assert.equal(result.failed, 1)
  assert.equal(result.skipped, 0)
  await assert.rejects(backfill({ ...options, request: async () => ({ ok: true, json: async () => [{ error: { code: 403 } }] }) }), /응답에 오류/)
})

test('backfill rerun preserves completed dates and continues after a partial commit failure', async () => {
  const documents = ['one', 'two'].map(id => ({ name: `projects/demo-upday/databases/(default)/documents/studyLogs/${id}`,
    updateTime: '2026-10-01T00:00:00Z', fields: { createdAt: { timestampValue: '2026-09-30T16:00:00Z' } } }))
  let fail = true, writes = 0
  const options = { project: 'demo-upday', token: 'test', apply: true, report: () => {}, request: async (url, options) => {
    if (url.endsWith(':runQuery')) return { ok: true, json: async () => documents.map(document => ({ document })) }
    const write = JSON.parse(options.body).writes[0]
    writes++
    if (fail && write.update.name.endsWith('/one')) return { ok: false, status: 409 }
    documents.find(item => item.name === write.update.name).fields.studyDate = write.update.fields.studyDate
    return { ok: true }
  } }
  const first = await backfill(options)
  assert.equal(first.updated, 1); assert.equal(first.failed, 1)
  fail = false
  const second = await backfill(options)
  assert.equal(second.updated, 1); assert.equal(second.skipped, 1)
  const third = await backfill(options)
  assert.equal(third.candidates, 0); assert.equal(third.failed, 0); assert.equal(writes, 3)
})

test('backfill scans beyond 200 documents with a stable ID cursor and rejects future creation dates', async () => {
  const documents = Array.from({ length: 201 }, (_, index) => ({
    name: `projects/demo-upday/databases/(default)/documents/studyLogs/${String(index).padStart(3, '0')}`,
    fields: { createdAt: { timestampValue: index === 200 ? '9999-01-01T00:00:00Z' : '2026-01-01T00:00:00Z' } },
  }))
  const calls = []
  const result = await backfill({ project: 'demo-upday', token: 'test', report: () => {}, request: async (_url, options) => {
    const query = JSON.parse(options.body).structuredQuery
    calls.push(query)
    return { ok: true, json: async () => (query.startAt ? documents.slice(200) : documents.slice(0, 200)).map(document => ({ document })) }
  } })
  assert.equal(result.scanned, 201); assert.equal(result.candidates, 200); assert.equal(result.failed, 1); assert.equal(result.updated, 0)
  assert.deepEqual(calls[1].startAt, { values: [{ referenceValue: documents[199].name }], before: false })
})
