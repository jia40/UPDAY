import { readFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import ts from 'typescript'
import { JSDOM } from 'jsdom'
import { FirebaseError } from 'firebase/app'

const require = createRequire(import.meta.url)
const dom = new JSDOM('<html><body></body></html>', { url: 'http://localhost/today' })
globalThis.window = dom.window
globalThis.document = dom.window.document
globalThis.HTMLElement = dom.window.HTMLElement
globalThis.Node = dom.window.Node
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator })
globalThis.IS_REACT_ACT_ENVIRONMENT = true
dom.window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
dom.window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
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
      if (id === 'firebase/app') return { FirebaseError }
      if (id.endsWith('.css')) return {}
      if (id.startsWith('.')) return load(new URL(id, url).href)
      return require(id)
    })
    cache.set(url.href, exports)
    return exports
  }
  return load
}
const item = { id: 'source', userId: 'owner', title: '지난 할 일', completed: false, date: '2026-09-29' }
function mount(options = {}) {
  const calls = { carry: [], create: [], rename: [], complete: [], remove: [] }
  const api = {
    fetchTodos: async (_uid, date) => options.todos ? options.todos(date) : [{ ...item, date }],
    fetchCarriedTodoIds: async () => options.receipts ? options.receipts() : new Set(),
    carryTodos: async (...args) => { calls.carry.push(args) },
    createTodo: async (...args) => { calls.create.push(args) },
    renameTodo: async (...args) => { calls.rename.push(args) },
    completeTodo: async (...args) => { calls.complete.push(args) },
    removeTodo: async (...args) => { calls.remove.push(args) },
    newTodoId: () => 'new', validTitle: value => value.trim(),
  }
  const page = loader({
    '../lib/todos': api,
    '../hooks/useAuth': { useAuth: () => ({ user: { uid: 'owner' }, isLoading: false }) },
    '../hooks/useToday': { useToday: () => '2026-09-30' },
  })('../src/pages/TodayPage.tsx')
  const view = render(createElement(page.default))
  const past = () => fireEvent.change(view.container.querySelector('#todo-date'), { target: { value: '2026-09-29' } })
  return { ...view, options, calls, past }
}

test('receipt failure preserves past list and summary, blocks carry, and recovers on refresh', async () => {
  const view = mount({ receipts: () => { throw new FirebaseError('permission-denied', '') } })
  view.past()
  await view.findByText(/이월 기록을 확인하지 못해/)
  assert.ok(view.getByRole('progressbar'))
  assert.equal(view.getByLabelText('지난 할 일 이월 선택').disabled, true)
  assert.equal(view.getByRole('button', { name: '오늘로 가져오기' }).disabled, true)
  view.options.receipts = () => new Set()
  fireEvent.click(view.getByRole('button', { name: '목록 새로고침' }))
  await waitFor(() => assert.equal(view.getByLabelText('지난 할 일 이월 선택').disabled, false))
  fireEvent.click(view.getByLabelText('지난 할 일 이월 선택'))
  fireEvent.click(view.getByRole('button', { name: '오늘로 가져오기' }))
  fireEvent.click(view.getByRole('button', { name: '가져오기', exact: true }))
  await waitFor(() => assert.deepEqual(view.calls.carry, [['owner', ['source']]]))
})

test('empty past date stays empty even if receipt access fails', async () => {
  const view = mount({ todos: () => [], receipts: () => { throw new Error('denied') } })
  view.past()
  await view.findByText('이 날짜에 등록한 할 일이 없어요.')
  assert.ok(view.getByText(/이월 기록을 확인하지 못해/))
})

test('slow receipt request does not delay the todo list and cannot enable carry early', async () => {
  let resolve
  const view = mount({ receipts: () => new Promise(done => { resolve = done }) })
  view.past()
  await view.findByLabelText('지난 할 일 이월 선택')
  assert.equal(view.getByLabelText('지난 할 일 이월 선택').disabled, true)
  await act(async () => resolve(new Set(['source'])))
  assert.ok(view.getByText('오늘로 이월됨'))
  assert.equal(view.getByLabelText('지난 할 일 이월 선택').disabled, true)
})

test('todo failure remains a load error rather than an empty list', async () => {
  const view = mount({ todos: () => { throw new FirebaseError('permission-denied', '') } })
  view.past()
  await view.findByText(/할 일에 접근할 권한이 없습니다/)
  assert.equal(view.queryByText('이 날짜에 등록한 할 일이 없어요.'), null)
  assert.equal(view.getByRole('button', { name: '오늘로 가져오기' }).disabled, true)
})

test('changing dates ignores a late receipt response from the previous date', async () => {
  let reject
  const view = mount({ receipts: () => new Promise((_resolve, fail) => { reject = fail }) })
  view.past()
  await view.findByLabelText('지난 할 일 이월 선택')
  fireEvent.click(view.getByRole('button', { name: '오늘로', exact: true }))
  await view.findByLabelText('새 할 일')
  await act(async () => reject(new Error('late failure')))
  assert.equal(view.queryByText(/이월 기록을 확인하지 못해/), null)
})

test('today add, rename, complete and delete remain available without receipt reads', async () => {
  const view = mount({ receipts: () => { throw new Error('must not read') } })
  await waitFor(() => assert.equal(view.getByRole('button', { name: '추가' }).disabled, false))
  fireEvent.change(view.getByLabelText('새 할 일'), { target: { value: '새 항목' } })
  fireEvent.click(view.getByRole('button', { name: '추가' }))
  await waitFor(() => assert.deepEqual(view.calls.create, [['new', 'owner', '2026-09-30', '새 항목']]))
  await waitFor(() => assert.equal(view.getByRole('checkbox').disabled, false))
  fireEvent.click(view.getByRole('checkbox'))
  await waitFor(() => assert.deepEqual(view.calls.complete, [['source', true]]))
  await waitFor(() => assert.equal(view.getByLabelText('지난 할 일 더보기').disabled, false))
  fireEvent.click(view.getByLabelText('지난 할 일 더보기'))
  fireEvent.click(view.getByRole('button', { name: '수정하기' }))
  fireEvent.change(view.getByLabelText('할 일 수정'), { target: { value: '수정 항목' } })
  fireEvent.click(view.getByRole('button', { name: '저장', exact: true }))
  await waitFor(() => assert.deepEqual(view.calls.rename, [['source', '수정 항목']]))
  await waitFor(() => assert.equal(view.getByLabelText('지난 할 일 더보기').disabled, false))
  fireEvent.click(view.getByLabelText('지난 할 일 더보기'))
  fireEvent.click(view.getByRole('button', { name: '삭제하기' }))
  fireEvent.click(view.getByRole('button', { name: '삭제하기', exact: true }))
  await waitFor(() => assert.deepEqual(view.calls.remove, [['source']]))
})
