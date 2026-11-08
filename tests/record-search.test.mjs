import { readFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import ts from 'typescript'
import { JSDOM } from 'jsdom'

const require = createRequire(import.meta.url)
const { Timestamp } = require('firebase/firestore')
const dom = new JSDOM('<html><body></body></html>', { url: 'http://localhost/study', pretendToBeVisual: true })
globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.HTMLElement = dom.window.HTMLElement
globalThis.IS_REACT_ACT_ENVIRONMENT = true
const { render, fireEvent, waitFor, cleanup, act } = await import('@testing-library/react')
const { createElement, useState } = await import('react')
afterEach(cleanup)

function loader(mocks = {}, request = globalThis.fetch) {
  const cache = new Map()
  function load(path) {
    let url = new URL(path, import.meta.url)
    if (!/\.tsx?$/.test(url.pathname)) url = new URL(url.href + (existsSync(new URL(url.href + '.tsx')) ? '.tsx' : '.ts'))
    if (cache.has(url.href)) return cache.get(url.href)
    const exports = {}
    const output = ts.transpileModule(readFileSync(url, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText
    new Function('exports', 'require', 'fetch', output)(exports, id => id in mocks ? mocks[id] : id.startsWith('.') ? load(new URL(id, url).href) : require(id), request)
    cache.set(url.href, exports); return exports
  }
  return load
}
const { searchRecords, normalizeSearch } = loader()('../src/lib/searchPolicy.ts')
const entry = (id, text = 'React Next') => ({ id, text, createdAt: new Timestamp(100, 0), tags: ['React'], status: 'learning', studyMinutes: 30, studyDate: '2026-11-06', position: 'developer', appliedAt: '', lastReviewedAt: null })

test('partial search trims whitespace, ignores case and intersects all supported filters', () => {
  assert.equal(normalizeSearch(' ReACT '), 'react')
  const rows = [entry('match'), { ...entry('tag'), tags: ['CS'] }, { ...entry('date'), studyDate: '2026-11-05' }]
  assert.deepEqual(searchRecords('study', rows, '  rEa  ', { date: '2026-11-06', tag: 'React' }).map(item => item.id), ['match'])
  assert.equal(searchRecords('job', [{ ...entry('job', 'Acme'), status: 'accepted' }], 'AC', { status: 'accepted' }).length, 1)
  assert.equal(searchRecords('job', [entry('job', 'Acme')], 'developer', {}).length, 0)
  const reviewed = Timestamp.fromDate(new Date('2026-10-30T12:00:00'))
  const interview = [entry('never'), { ...entry('due'), lastReviewedAt: reviewed }, { ...entry('explained'), status: 'explainable' }, { ...entry('recent'), lastReviewedAt: Timestamp.fromDate(new Date('2026-11-05T12:00:00')) }]
  assert.deepEqual(searchRecords('interview', interview, 'react', { status: 'learning', tag: 'React', reviewOnly: true, today: '2026-11-06' }).map(item => item.id), ['due', 'never'])
  assert.equal(searchRecords('study', rows, '   ', {}).length, 3)
})

test('search preserves local legacy dates and nanosecond/ID order without mutating statistics inputs', () => {
  const date = Timestamp.fromDate(new Date('2024-02-29T12:00:00'))
  const rows = [{ ...entry('b'), studyDate: undefined, createdAt: date }, { ...entry('a'), studyDate: undefined, createdAt: date }]
  assert.deepEqual(searchRecords('study', rows, 'react', { date: '2024-02-29' }).map(item => item.id), ['a', 'b'])
  assert.deepEqual(rows.map(item => item.id), ['b', 'a'])
  const precise = [{ ...entry('a'), createdAt: new Timestamp(100, 1) }, { ...entry('z'), createdAt: new Timestamp(100, 2) }]
  assert.deepEqual(searchRecords('job', precise, 'react', {}).map(item => item.id), ['z', 'a'])
})

function api(request) {
  const tokens = []
  const user = { uid: 'owner', getIdToken: async force => { tokens.push(force); return 'test-token' } }
  const auth = { currentUser: user }
  const methods = loader({ './firebase': { auth }, './firestore': { db: { app: { options: { projectId: 'demo-upday' } } } } }, request)('../src/lib/recordSearch.ts')
  return { ...methods, auth, user, tokens }
}
function document(kind, id = 'id') {
  const [collection, field] = kind === 'study' ? ['studyLogs', 'title'] : kind === 'interview' ? ['interviewQuestions', 'question'] : ['applications', 'company']
  return { document: { name: `projects/demo-upday/databases/(default)/documents/${collection}/${id}`, fields: {
    [field]: { stringValue: 'React 검색' }, createdAt: { timestampValue: '2026-11-01T00:00:00.123456789Z' }, studyMinutes: { integerValue: '30' },
    status: { stringValue: 'learning' }, tags: { arrayValue: { values: [{ stringValue: 'React' }] } },
  } } }
}

test('all search projections restrict UID, exclude bodies and preserve timestamps', async () => {
  for (const kind of ['study', 'interview', 'job']) {
    let query
    const client = api(async (_url, options) => { query = JSON.parse(options.body).structuredQuery; return { ok: true, status: 200, json: async () => [document(kind)] } })
    const rows = await client.fetchRecordSearchIndex(kind, 'owner')
    assert.deepEqual(query.where.fieldFilter, { field: { fieldPath: 'userId' }, op: 'EQUAL', value: { stringValue: 'owner' } })
    const fields = query.select.fields.map(item => item.fieldPath)
    for (const omitted of ['content', 'answer', 'memo', 'url']) assert.equal(fields.includes(omitted), false)
    assert.ok(fields.includes(kind === 'study' ? 'title' : kind === 'interview' ? 'question' : 'company'))
    assert.equal(rows[0].createdAt.nanoseconds, 123456789)
    await assert.rejects(client.fetchRecordSearchIndex(kind, 'other'), error => error.code === 'permission-denied')
  }
})

test('authentication retry, API failure, malformed responses and account changes never become empty success', async () => {
  let count = 0
  const retry = api(async () => ++count === 1 ? { ok: false, status: 401 } : { ok: true, status: 200, json: async () => [] })
  assert.deepEqual(await retry.fetchRecordSearchIndex('job', 'owner'), [])
  assert.deepEqual(retry.tokens, [false, true])
  const forbidden = api(async () => ({ ok: false, status: 403 }))
  await assert.rejects(forbidden.fetchRecordSearchIndex('job', 'owner'), error => error.code === 'permission-denied')
  const malformed = api(async () => ({ ok: true, status: 200, json: async () => [{ error: { code: 500 } }] }))
  await assert.rejects(malformed.fetchRecordSearchIndex('job', 'owner'), /검색 응답/)
  const switched = api(async () => ({ ok: true, status: 200, json: async () => { switched.auth.currentUser = { uid: 'other' }; return [document('job')] } }))
  await assert.rejects(switched.fetchRecordSearchIndex('job', 'owner'), error => error.code === 'permission-denied')
})

test('search form only applies on submit, trims blanks and clears both draft and applied query', () => {
  const { SearchForm } = loader()('../src/components/RecordSearch.tsx')
  function Form() {
    const [value, onChange] = useState({ draft: '', query: '' })
    return createElement('div', null, createElement(SearchForm, { label: '제목', value, onChange }), createElement('output', { 'data-testid': 'query' }, value.query))
  }
  const view = render(createElement(Form))
  fireEvent.change(view.getByRole('searchbox', { name: '제목 검색' }), { target: { value: ' React ' } })
  assert.equal(view.getByTestId('query').textContent, '')
  fireEvent.submit(view.getByRole('search'))
  assert.equal(view.getByTestId('query').textContent, 'React')
  fireEvent.change(view.getByRole('searchbox', { name: '제목 검색' }), { target: { value: '   ' } })
  fireEvent.submit(view.getByRole('search'))
  assert.equal(view.getByTestId('query').textContent, '')
  fireEvent.click(view.getByRole('button', { name: '검색어 초기화' }))
  assert.equal(view.getByRole('searchbox', { name: '제목 검색' }).value, '')
})

function results(props = {}) {
  const requests = []
  const Results = loader({ '../lib/recordSearch': { fetchRecordSearchIndex: (kind, uid) => new Promise((resolve, reject) => requests.push({ kind, uid, resolve, reject })) } })('../src/components/RecordSearchResults.tsx').default
  const initial = { kind: 'study', userId: 'owner', query: 'react', filters: {}, ...props }
  const view = render(createElement(Results, initial))
  return { ...view, requests, change: updates => view.rerender(createElement(Results, { ...initial, ...updates })) }
}

test('search covers beyond the first page, resets pages on conditions and reuses projected data', async () => {
  const view = results()
  await waitFor(() => assert.equal(view.requests.length, 1))
  const rows = Array.from({ length: 45 }, (_, index) => ({ ...entry(String(index)), tags: index < 21 ? ['React'] : ['CS'] }))
  await act(async () => view.requests[0].resolve(rows))
  assert.equal(view.getAllByRole('link').length, 20)
  assert.match(view.getByText(/검색 결과/).textContent, /검색 결과 45개 · 현재 20개 표시/)
  fireEvent.click(view.getByRole('button', { name: '더 보기' }))
  assert.equal(view.getAllByRole('link').length, 40)
  view.change({ query: 'next' })
  assert.equal(view.getAllByRole('link').length, 20)
  view.change({ filters: { tag: 'React' } })
  assert.match(view.getByText(/검색 결과/).textContent, /검색 결과 21개/)
  assert.equal(view.requests.length, 1)
  view.change({ query: '없는 검색어' })
  assert.ok(view.getByText('검색 조건에 맞는 기록이 없습니다.'))
})

test('search errors retry, return refresh updates records, and old account responses are ignored', async () => {
  const view = results({ kind: 'job' })
  await waitFor(() => assert.equal(view.requests.length, 1))
  await act(async () => view.requests[0].reject(new Error('검색 조회 실패')))
  assert.ok(view.getByRole('alert'))
  assert.equal(view.queryByText('검색 조건에 맞는 기록이 없습니다.'), null)
  fireEvent.click(view.getByRole('button', { name: '검색 다시 불러오기' }))
  await waitFor(() => assert.equal(view.requests.length, 2))
  await act(async () => view.requests[1].resolve([entry('one')]))
  assert.equal(view.getAllByRole('link').length, 1)
  act(() => window.dispatchEvent(new window.Event('focus')))
  await waitFor(() => assert.equal(view.requests.length, 3))
  view.change({ userId: 'other' })
  await waitFor(() => assert.equal(view.requests.length, 4))
  assert.equal(view.queryByRole('link'), null)
  await act(async () => view.requests[3].resolve([]))
  await act(async () => view.requests[2].resolve([entry('old-account')]))
  assert.ok(view.getByText('검색 조건에 맞는 기록이 없습니다.'))
  assert.equal(view.queryByRole('link'), null)
})

for (const [kind, label, file] of [['study', '제목', 'StudyList'], ['interview', '질문', 'InterviewRecords'], ['job', '기업명', 'JobList']]) {
  test(`${kind} list wires explicit search and existing filters, and clearing restores its normal list`, async () => {
    const seen = []
    const emptyPage = { items: [], pending: false, error: '', hasLoaded: true, hasMore: false, loadMore: () => {}, retry: () => {} }
    const mockComponent = fn => ({ __esModule: true, default: fn })
    const load = loader({
      '../hooks/useToday': { useToday: () => '2026-11-06' },
      '../hooks/useJobPage': { useJobPage: () => emptyPage },
      '../hooks/useInterviewRecords': { useInterviewRecords: () => ({ overview: [], record: null, loading: false, error: '', revision: 0, reload: () => {} }) },
      '../lib/applications': { applicationStatuses: { accepted: '합격' } },
      '../lib/interviewQuestions': { interviewStatuses: { learning: '학습 중' } },
      './StudyHeatmap': mockComponent(({ onSelect }) => createElement('button', { onClick: () => onSelect('2026-11-06') }, '날짜 선택')),
      './StudyWeeklyStats': mockComponent(() => null), './StudyMonthlyStats': mockComponent(() => null),
      './StudyRecordList': mockComponent(() => createElement('p', null, '일반 학습 목록')),
      './InterviewForm': mockComponent(() => null), './InterviewDetail': mockComponent(() => null), './InterviewPageList': mockComponent(() => null),
      './RecordSearchResults': mockComponent(props => { seen.push(props); return createElement('p', null, '검색 결과 연결') }),
    })
    const Component = load(`../src/components/${file}.tsx`).default
    const props = kind === 'study' ? { userId: 'owner', overview: [], revision: 0, loading: false, hasLoaded: true, error: '', reload: () => {} }
      : kind === 'interview' ? { userId: 'owner', questionId: null } : { userId: 'owner' }
    const view = render(createElement(Component, props))
    fireEvent.change(view.getByRole('searchbox', { name: `${label} 검색` }), { target: { value: ' React ' } })
    assert.equal(seen.length, 0)
    fireEvent.submit(view.getByRole('search'))
    await view.findByText('검색 결과 연결')
    assert.equal(seen.at(-1).kind, kind); assert.equal(seen.at(-1).userId, 'owner'); assert.equal(seen.at(-1).query, 'React')
    if (kind === 'study') {
      fireEvent.click(view.getByRole('button', { name: '날짜 선택' }))
      assert.equal(seen.at(-1).filters.date, '2026-11-06')
    } else if (kind === 'interview') {
      fireEvent.change(view.getByLabelText('이해 상태 필터'), { target: { value: 'learning' } })
      fireEvent.click(view.getByLabelText('복습 대상만 보기'))
      assert.equal(seen.at(-1).filters.status, 'learning'); assert.equal(seen.at(-1).filters.reviewOnly, true)
    } else {
      fireEvent.change(view.getByLabelText('지원 상태 필터'), { target: { value: 'accepted' } })
      assert.equal(seen.at(-1).filters.status, 'accepted')
    }
    fireEvent.click(view.getByRole('button', { name: '검색어 초기화' }))
    assert.equal(view.queryByText('검색 결과 연결'), null)
    assert.equal(view.getByRole('searchbox', { name: `${label} 검색` }).value, '')
  })
}
