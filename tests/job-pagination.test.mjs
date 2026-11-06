import { readFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import ts from 'typescript'
import { JSDOM } from 'jsdom'

const require = createRequire(import.meta.url)
const dom = new JSDOM('<html><body></body></html>', { url: 'http://localhost/job', pretendToBeVisual: true })
globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.HTMLElement = dom.window.HTMLElement
globalThis.IS_REACT_ACT_ENVIRONMENT = true
const { render, fireEvent, waitFor, cleanup, act } = await import('@testing-library/react')
const { createElement } = await import('react')
afterEach(cleanup)

function loader(mocks = {}) {
  const cache = new Map()
  function load(path) {
    let url = new URL(path, import.meta.url)
    if (!/\.tsx?$/.test(url.pathname)) url = new URL(url.href + (existsSync(new URL(url.href + '.tsx')) ? '.tsx' : '.ts'))
    if (cache.has(url.href)) return cache.get(url.href)
    const exports = {}
    const output = ts.transpileModule(readFileSync(url, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText
    new Function('exports', 'require', output)(exports, id => id in mocks ? mocks[id] : id.startsWith('.') ? load(new URL(id, url).href) : require(id))
    cache.set(url.href, exports); return exports
  }
  return load
}
const record = id => ({ id, userId: 'owner', company: `회사 ${id}`, position: '개발자', status: 'interested', appliedAt: '', memo: '', url: '' })

function apiHarness(size) {
  const calls = []
  const docs = Array.from({ length: size }, (_, index) => {
    const id = String(index).padStart(2, '0')
    return { id, data: () => ({ ...record(id), status: index === 22 ? 'accepted' : 'interested' }) }
  })
  const api = loader({ './firestore': { db: {} }, 'firebase/firestore': {
    collection: () => 'applications', documentId: () => '__name__', where: (...args) => ['where', ...args],
    orderBy: (...args) => ['order', ...args], startAfter: cursor => ['after', cursor], limit: n => ['limit', n], query: (...args) => args,
    getDocsFromServer: async query => {
      calls.push(query)
      const status = query.find(part => part[0] === 'where' && part[1] === 'status')?.[3]
      const eligible = status ? docs.filter(doc => doc.data().status === status) : docs
      const cursor = query.find(part => part[0] === 'after')?.[1]
      const start = cursor ? eligible.findIndex(doc => doc === cursor) + 1 : 0
      return { docs: eligible.slice(start, start + query.at(-1)[1]) }
    },
  } })('../src/lib/applications.ts')
  return { api, calls, docs }
}

test('SDK pagination is owner scoped, ordered, limited to 21 and uses the last displayed snapshot', async () => {
  const { api, calls, docs } = apiHarness(23)
  const first = await api.fetchApplicationPage('owner')
  assert.equal(first.items.length, 20); assert.equal(first.hasMore, true)
  assert.equal(first.cursor, docs[19])
  assert.deepEqual(calls[0], ['applications', ['where', 'userId', '==', 'owner'], ['order', 'createdAt', 'desc'], ['order', '__name__', 'asc'], ['limit', 21]])
  const second = await api.fetchApplicationPage('owner', '', first.cursor)
  assert.deepEqual(second.items.map(item => item.id), ['20', '21', '22'])
  assert.equal(second.hasMore, false)
  assert.ok(calls[1].some(part => part[0] === 'after' && part[1] === docs[19]))
  assert.equal(new Set([...first.items, ...second.items].map(item => item.id)).size, 23)
  const filtered = await api.fetchApplicationPage('owner', 'accepted')
  assert.deepEqual(filtered.items.map(item => item.id), ['22'])
  assert.ok(calls[2].some(part => JSON.stringify(part) === JSON.stringify(['where', 'status', '==', 'accepted'])))
  await assert.rejects(api.fetchApplicationPage('owner', 'invalid'))
  assert.equal(calls.length, 3)
})

test('empty and exactly-20 pages terminate without an unnecessary next-page indication', async () => {
  for (const size of [0, 20, 21]) {
    const { api } = apiHarness(size)
    const page = await api.fetchApplicationPage('owner')
    assert.equal(page.items.length, Math.min(size, 20))
    assert.equal(page.hasMore, size > 20)
    if (!size) assert.equal(page.cursor, undefined)
  }
})

function mount() {
  const requests = []
  const List = loader({ '../lib/applications': {
    applicationStatuses: { interested: '관심', accepted: '합격' },
    fetchApplicationPage: (...args) => new Promise((resolve, reject) => requests.push({ args, resolve, reject })),
  }, '../lib/jobErrors': { errorText: reason => reason.message } })('../src/components/JobList.tsx').default
  const view = render(createElement(List, { key: 'owner', userId: 'owner' }))
  return { ...view, requests, setUser: uid => view.rerender(createElement(List, { key: uid, userId: uid })) }
}

test('more failure retains records and retries the identical cursor; counts describe loaded records', async () => {
  const view = mount()
  await waitFor(() => assert.equal(view.requests.length, 1))
  await act(async () => view.requests[0].resolve({ items: Array.from({ length: 20 }, (_, i) => record(i)), cursor: 'cursor20', hasMore: true }))
  assert.match(view.getByText(/불러온 지원 기록/).textContent, /20개/)
  fireEvent.click(view.getByRole('button', { name: '더 보기' }))
  await waitFor(() => assert.equal(view.requests.length, 2))
  await act(async () => view.requests[1].reject(new Error('추가 조회 실패')))
  assert.equal(view.getAllByRole('link').length, 20)
  fireEvent.click(view.getByRole('button', { name: '다시 불러오기' }))
  await waitFor(() => assert.equal(view.requests.length, 3))
  assert.deepEqual(view.requests[2].args, ['owner', '', 'cursor20'])
  await act(async () => view.requests[2].resolve({ items: [record(19), record(20), record(21)], cursor: 'last', hasMore: false }))
  assert.equal(view.getAllByRole('link').length, 22)
  assert.equal(view.queryByRole('button', { name: '더 보기' }), null)
  assert.match(view.getByText(/불러온 지원 기록/).textContent, /22개 · 마지막 페이지/)
})

test('filter/account changes reset cursor and ignore old additional-page responses', async () => {
  const view = mount()
  await waitFor(() => assert.equal(view.requests.length, 1))
  await act(async () => view.requests[0].resolve({ items: [record('old')], cursor: 'old-cursor', hasMore: true }))
  fireEvent.click(view.getByRole('button', { name: '더 보기' }))
  await waitFor(() => assert.equal(view.requests.length, 2))
  fireEvent.change(view.getByLabelText('지원 상태 필터'), { target: { value: 'accepted' } })
  await waitFor(() => assert.equal(view.requests.length, 3))
  assert.deepEqual(view.requests[2].args, ['owner', 'accepted', undefined])
  assert.equal(view.queryByRole('link'), null)
  await act(async () => view.requests[1].resolve({ items: [record('stale')], hasMore: false }))
  assert.equal(view.queryByText('회사 stale'), null)
  view.setUser('other')
  await waitFor(() => assert.equal(view.requests.length, 4))
  assert.deepEqual(view.requests[3].args, ['other', '', undefined])
  await act(async () => view.requests[3].resolve({ items: [record('other')], hasMore: false }))
  await act(async () => view.requests[2].resolve({ items: [record('old-account')], hasMore: false }))
  assert.ok(view.getByText('회사 other'))
  assert.equal(view.queryByText('회사 old-account'), null)
})

test('tab return refresh supersedes a pending additional page and replaces the first page', async () => {
  const view = mount()
  await waitFor(() => assert.equal(view.requests.length, 1))
  await act(async () => view.requests[0].resolve({ items: [record('old')], cursor: 'old-cursor', hasMore: true }))
  fireEvent.click(view.getByRole('button', { name: '더 보기' }))
  await waitFor(() => assert.equal(view.requests.length, 2))
  act(() => window.dispatchEvent(new window.Event('focus')))
  await waitFor(() => assert.equal(view.requests.length, 3))
  assert.deepEqual(view.requests[2].args, ['owner', '', undefined])
  await act(async () => view.requests[2].resolve({ items: [record('fresh')], cursor: 'fresh-cursor', hasMore: false }))
  await act(async () => view.requests[1].resolve({ items: [record('stale')], hasMore: false }))
  assert.ok(view.getByText('회사 fresh'))
  assert.equal(view.queryByText('회사 old'), null)
  assert.equal(view.queryByText('회사 stale'), null)
})

test('first-page failure stays an error and retry can recover to a genuine empty result', async () => {
  const view = mount()
  await waitFor(() => assert.equal(view.requests.length, 1))
  await act(async () => view.requests[0].reject(new Error('조회 실패')))
  assert.ok(view.getByRole('alert'))
  assert.equal(view.queryByText('아직 등록한 지원 기록이 없습니다.'), null)
  fireEvent.click(view.getByRole('button', { name: '다시 불러오기' }))
  await waitFor(() => assert.equal(view.requests.length, 2))
  assert.deepEqual(view.requests[1].args, ['owner', '', undefined])
  await act(async () => view.requests[1].resolve({ items: [], hasMore: false }))
  assert.ok(view.getByText('아직 등록한 지원 기록이 없습니다.'))
})
