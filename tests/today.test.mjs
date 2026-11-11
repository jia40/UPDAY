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
globalThis.Element = dom.window.Element
globalThis.HTMLAnchorElement = dom.window.HTMLAnchorElement
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator })
globalThis.IS_REACT_ACT_ENVIRONMENT = true
dom.window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
dom.window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
const { render, fireEvent, waitFor, cleanup, act, within } = await import('@testing-library/react')
const { createElement } = await import('react')
afterEach(() => { cleanup(); delete document.visibilityState })

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
function returnToTab() {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
  act(() => {
    window.dispatchEvent(new window.Event('focus'))
    document.dispatchEvent(new window.Event('visibilitychange'))
    window.dispatchEvent(new window.PageTransitionEvent('pageshow', { persisted: true }))
  })
}
const flushReturnEvents = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 150)) })
function mount(options = {}) {
  let today = '2026-09-30'
  let userId = 'owner'
  const calls = { carry: [], create: [], rename: [], complete: [], remove: [], reads: [], receipts: [] }
  const notes = new Map()
  const noteCalls = { reads: [], writes: [], deletes: [] }
  const api = {
    fetchTodos: async (uid, date) => { calls.reads.push([uid, date]); return options.todos ? options.todos(date, uid) : [{ ...item, date }] },
    fetchCarriedTodoIds: async (uid, date) => { calls.receipts.push([uid, date]); return options.receipts ? options.receipts(uid, date) : new Set() },
    carryTodos: async (...args) => { calls.carry.push(args) },
    createTodo: async (...args) => { calls.create.push(args); await options.create?.(...args) },
    renameTodo: async (...args) => { calls.rename.push(args); await options.rename?.(...args) },
    completeTodo: async (...args) => { calls.complete.push(args) },
    removeTodo: async (...args) => { calls.remove.push(args) },
    newTodoId: () => 'new', validTitle: value => value.trim(),
  }
  const page = loader({
    '../lib/todos': api,
    '../lib/dailyNotes': {
      DAILY_NOTE_LIMIT: 200, singleLine: text => text.replace(/[\r\n\u2028\u2029]+/g, ' '),
      fetchDailyNote: async (uid, date) => { noteCalls.reads.push([uid, date]); return options.noteRead ? options.noteRead(uid, date) : notes.get(`${uid}:${date}`) ?? '' },
      saveDailyNote: async (uid, date, text) => { noteCalls.writes.push([uid, date, text]); await options.noteWrite?.(); notes.set(`${uid}:${date}`, text.trim()) },
      deleteDailyNote: async (uid, date) => { noteCalls.deletes.push([uid, date]); notes.delete(`${uid}:${date}`) },
    },
    './useLogoutGuard': { useLogoutGuard: () => options.logoutGuard ?? null },
    '../components/TodayStudySummary': { __esModule: true, default: () => null },
    '../hooks/useAuth': { useAuth: () => ({ user: userId ? { uid: userId } : null, isLoading: false }) },
    '../hooks/useToday': { useToday: () => today },
  })('../src/pages/TodayPage.tsx')
  const view = render(createElement(page.default))
  const past = () => fireEvent.change(view.getByLabelText('할 일 조회 날짜'), { target: { value: '2026-09-29' } })
  return { ...view, options, calls, noteCalls, past,
    setToday: value => { today = value; view.rerender(createElement(page.default)) },
    setUser: value => { userId = value; view.rerender(createElement(page.default)) },
  }
}

test('dirty new input confirms date changes, cancel preserves input, approval clears it without saving', async () => {
  const view = mount()
  await waitFor(() => assert.equal(view.getByLabelText('새 할 일').disabled, false))
  fireEvent.change(view.getByLabelText('새 할 일'), { target: { value: '작성 중인 할 일' } })
  fireEvent.change(view.getByLabelText('할 일 조회 날짜'), { target: { value: '2026-09-30' } })
  assert.equal(view.queryByRole('dialog'), null)
  view.past()
  assert.ok(view.getByRole('dialog', { name: '날짜 변경' }))
  assert.equal(view.getByLabelText('할 일 조회 날짜').value, '2026-09-30')
  fireEvent.click(view.getByRole('button', { name: '취소', exact: true }))
  assert.equal(view.getByLabelText('새 할 일').value, '작성 중인 할 일')
  view.past()
  fireEvent.click(view.getByRole('button', { name: '이동하기' }))
  await view.findByLabelText('지난 할 일 이월 선택')
  assert.equal(view.getByLabelText('할 일 조회 날짜').value, '2026-09-29')
  fireEvent.click(view.getByRole('button', { name: '오늘로', exact: true }))
  await view.findByLabelText('새 할 일')
  assert.equal(view.getByLabelText('새 할 일').value, '')
  assert.deepEqual(view.calls.create, [])
})

test('daily note past-date save retries without losing input, blocks date changes, then updates and deletes', async () => {
  let fail = true, finish
  const view = mount({ noteWrite: async () => { if (fail) throw new Error('메모 저장 실패'); await new Promise(resolve => { finish = resolve }) } })
  view.past()
  const note = within(await view.findByRole('region', { name: '한 줄 기록' }))
  const input = await note.findByLabelText('한 줄 기록 내용')
  const save = () => note.getByRole('button', { name: '한 줄 기록 저장' })
  fireEvent.change(input, { target: { value: '회고\n한 줄' } })
  assert.equal(input.value, '회고 한 줄')
  assert.ok(note.getByText('6 / 200자'))
  fireEvent.click(save())
  await note.findByText('메모 저장 실패')
  assert.equal(input.value, '회고 한 줄')
  fail = false
  fireEvent.click(save()); fireEvent.click(save())
  assert.equal(view.getByLabelText('할 일 조회 날짜').disabled, true)
  assert.equal(view.getByRole('button', { name: '오늘로', exact: true }).disabled, true)
  assert.deepEqual(view.noteCalls.writes, [['owner', '2026-09-29', '회고 한 줄'], ['owner', '2026-09-29', '회고 한 줄']])
  await act(async () => finish())
  assert.ok(note.getByText('한 줄 기록을 저장했습니다.'))
  view.options.noteWrite = undefined
  fireEvent.change(input, { target: { value: '수정한 회고' } })
  await act(async () => fireEvent.click(save()))
  assert.deepEqual(view.noteCalls.writes.at(-1), ['owner', '2026-09-29', '수정한 회고'])
  fireEvent.click(note.getByRole('button', { name: '한 줄 기록 삭제' }))
  await act(async () => fireEvent.click(within(view.getByRole('dialog')).getByRole('button', { name: '삭제하기' })))
  assert.equal(input.value, '')
  assert.deepEqual(view.noteCalls.deletes, [['owner', '2026-09-29']])
})

test('note draft survives date cancel, internal navigation, unload and logout cancellation', async () => {
  let check
  const view = mount({ logoutGuard: { register: callback => { check = callback; return () => { check = undefined } }, loggingOut: false } })
  const input = await view.findByLabelText('한 줄 기록 내용')
  fireEvent.change(input, { target: { value: '아직 저장 안 함' } })
  view.past()
  assert.ok(view.getByRole('dialog', { name: '날짜 변경' }))
  fireEvent.click(within(view.getByRole('dialog')).getByRole('button', { name: '취소' }))
  assert.equal(input.value, '아직 저장 안 함')
  const unload = new window.Event('beforeunload', { cancelable: true })
  window.dispatchEvent(unload)
  assert.equal(unload.defaultPrevented, true)
  const link = document.createElement('a')
  link.href = '/study'; document.body.append(link)
  try { assert.equal(fireEvent.click(link), false) } finally { link.remove() }
  assert.ok(view.getByRole('dialog', { name: '작성 내용 확인' }))
  fireEvent.click(view.getByRole('button', { name: '계속 작성' }))
  let decision
  act(() => { decision = check() })
  fireEvent.click(view.getByRole('button', { name: '계속 작성' }))
  assert.equal(await decision, false)
  assert.equal(input.value, '아직 저장 안 함')
  view.past()
  await act(async () => fireEvent.click(view.getByRole('button', { name: '이동하기' })))
  assert.equal(view.getByLabelText('한 줄 기록 내용').value, '')
  assert.equal(view.getByLabelText('할 일 조회 날짜').value, '2026-09-29')
})

function unloadBlocked() {
  const event = new window.Event('beforeunload', { cancelable: true })
  window.dispatchEvent(event)
  return event.defaultPrevented
}

function clickStudyLink() {
  const link = document.createElement('a')
  link.href = '/study'
  // Capture whether the guard allowed navigation without actually leaving jsdom.
  let reachedLink = false
  link.addEventListener('click', event => { reachedLink = true; event.preventDefault() })
  document.body.append(link)
  try { fireEvent.click(link); return reachedLink } finally { link.remove() }
}

for (const editing of [false, true]) {
  test(`todo ${editing ? 'edit' : 'new'} draft protects navigation, unload and logout without a note draft`, async () => {
    let check
    const view = mount({ logoutGuard: { register: callback => { check = callback; return () => { check = undefined } }, loggingOut: false } })
    await view.findByLabelText('지난 할 일 더보기')
    if (editing) {
      fireEvent.click(view.getByLabelText('지난 할 일 더보기'))
      fireEvent.click(view.getByRole('button', { name: '수정하기' }))
    }
    const input = view.getByLabelText(editing ? '할 일 수정' : '새 할 일')
    assert.equal(unloadBlocked(), false)
    fireEvent.change(input, { target: { value: '할 일 초안' } })
    assert.equal(unloadBlocked(), true)
    assert.equal(clickStudyLink(), false)
    assert.ok(view.getByRole('dialog', { name: '작성 내용 확인' }))
    fireEvent.click(view.getByRole('button', { name: '계속 작성' }))
    let decision
    act(() => { decision = check() })
    fireEvent.click(view.getByRole('button', { name: '계속 작성' }))
    assert.equal(await decision, false)
    assert.equal(input.value, '할 일 초안')
    fireEvent.change(input, { target: { value: editing ? '지난 할 일' : '' } })
    assert.equal(unloadBlocked(), false)
    assert.equal(clickStudyLink(), true)
    assert.equal(await check(), true)
  })
}

test('switching edited todo confirms only a changed title and preserves unrelated drafts', async () => {
  const view = mount({ todos: () => [{ ...item, id: 'a', title: '첫 번째' }, { ...item, id: 'b', title: '두 번째' }] })
  const edit = title => {
    fireEvent.click(view.getByLabelText(`${title} 더보기`))
    fireEvent.click(view.getByRole('button', { name: '수정하기' }))
  }
  await view.findByLabelText('첫 번째 더보기')
  edit('첫 번째'); edit('두 번째')
  assert.equal(view.queryByRole('dialog'), null)
  fireEvent.change(view.getByLabelText('새 할 일'), { target: { value: '새 제목' } })
  fireEvent.change(await view.findByLabelText('한 줄 기록 내용'), { target: { value: '한 줄 기록 초안' } })
  fireEvent.change(view.getByLabelText('할 일 수정'), { target: { value: '두 번째 수정 중' } })
  edit('첫 번째')
  const dialog = () => within(view.getByRole('dialog', { name: '할 일 편집 전환' }))
  fireEvent.click(dialog().getByRole('button', { name: '취소' }))
  assert.equal(view.getByLabelText('할 일 수정').value, '두 번째 수정 중')
  edit('첫 번째')
  fireEvent.click(dialog().getByRole('button', { name: '전환하기' }))
  assert.equal(view.getByLabelText('할 일 수정').value, '첫 번째')
  assert.equal(view.getByLabelText('새 할 일').value, '새 제목')
  assert.equal(view.getByLabelText('한 줄 기록 내용').value, '한 줄 기록 초안')
  assert.deepEqual(view.calls.rename, [])
})

test('todo save blocks navigation without a dialog, retains failure draft, and releases protection after retry', async () => {
  let check, settle
  const view = mount({
    create: () => new Promise((resolve, reject) => { settle = { resolve, reject } }),
    logoutGuard: { register: callback => { check = callback; return () => { check = undefined } }, loggingOut: false },
  })
  await view.findByLabelText('지난 할 일 더보기')
  const input = view.getByLabelText('새 할 일')
  fireEvent.change(input, { target: { value: '저장할 할 일' } })
  const save = () => fireEvent.click(view.getByRole('button', { name: '추가' }))
  save()
  assert.equal(unloadBlocked(), true)
  assert.equal(clickStudyLink(), false)
  assert.equal(await check(), false)
  assert.equal(view.queryByRole('dialog'), null)
  assert.equal(view.getByLabelText('할 일 조회 날짜').disabled, true)
  assert.equal(view.getByLabelText('지난 할 일 더보기').disabled, true)
  await act(async () => settle.reject(new Error('저장 실패')))
  assert.equal(input.value, '저장할 할 일')
  assert.equal(unloadBlocked(), true)
  save()
  await act(async () => settle.resolve())
  assert.equal(input.value, '')
  assert.equal(unloadBlocked(), false)
  assert.equal(clickStudyLink(), true)
  assert.equal(await check(), true)
  assert.deepEqual(view.calls.create[1], view.calls.create[0])
})

test('midnight waits for a note save and keeps an unsaved note if the date change is cancelled', async () => {
  let finish, check
  const view = mount({
    noteWrite: () => new Promise((resolve, reject) => { finish = () => reject(new Error('저장 실패')) }),
    logoutGuard: { register: callback => { check = callback; return () => { check = undefined } }, loggingOut: false },
  })
  const input = await view.findByLabelText('한 줄 기록 내용')
  fireEvent.change(input, { target: { value: '자정 전 메모' } })
  fireEvent.click(view.getByRole('button', { name: '한 줄 기록 저장' }))
  assert.equal(await check(), false)
  view.setToday('2026-10-01')
  assert.equal(view.queryByRole('dialog'), null)
  assert.equal(view.getByLabelText('할 일 조회 날짜').value, '2026-09-30')
  await act(async () => finish())
  fireEvent.click(within(view.getByRole('dialog', { name: '날짜 변경' })).getByRole('button', { name: '취소' }))
  assert.equal(input.value, '자정 전 메모')
  assert.equal(view.getByLabelText('할 일 조회 날짜').value, '2026-09-30')
  assert.equal(view.getByRole('button', { name: '한 줄 기록 저장' }).disabled, false)
})

test('note read errors retry, return refresh preserves draft and ignores a late response from an old account', async () => {
  const view = mount({ noteRead: async () => { throw new Error('offline') } })
  await view.findByText('한 줄 기록을 불러오지 못했습니다. 다시 시도해주세요.')
  assert.equal(view.queryByLabelText('한 줄 기록 내용'), null)
  view.options.noteRead = () => '저장한 메모'
  fireEvent.click(view.getByRole('button', { name: '한 줄 기록 다시 불러오기' }))
  const input = await view.findByLabelText('한 줄 기록 내용')
  assert.equal(input.value, '저장한 메모')
  let finish
  view.options.noteRead = () => new Promise(resolve => { finish = resolve })
  returnToTab()
  await waitFor(() => assert.ok(finish))
  fireEvent.change(input, { target: { value: '보호할 입력' } })
  await act(async () => finish('다른 탭 메모'))
  assert.equal(input.value, '보호할 입력')
  await flushReturnEvents()
  returnToTab()
  await flushReturnEvents()
  assert.equal(view.noteCalls.reads.length, 3)
  let oldResponse
  view.options.noteRead = (uid) => uid === 'owner' ? new Promise(resolve => { oldResponse = resolve }) : '다른 계정 기록'
  fireEvent.click(view.getByRole('button', { name: '입력 되돌리기' }))
  await waitFor(() => assert.ok(oldResponse))
  view.setUser('other')
  const other = await view.findByLabelText('한 줄 기록 내용')
  await act(async () => oldResponse('이전 계정 내용'))
  assert.equal(other.value, '다른 계정 기록')
})

test('tab return coalesces events and in-flight reads while preserving a new todo draft', async () => {
  const view = mount()
  await view.findByLabelText('지난 할 일 더보기')
  fireEvent.change(view.getByLabelText('새 할 일'), { target: { value: '작성 중' } })
  let finish
  view.options.todos = () => new Promise(resolve => { finish = resolve })
  returnToTab()
  await waitFor(() => assert.equal(view.calls.reads.length, 2))
  returnToTab()
  await flushReturnEvents()
  assert.equal(view.calls.reads.length, 2)
  await act(async () => finish([{ ...item, title: '다른 탭의 변경' }]))
  assert.ok(view.getByText('다른 탭의 변경'))
  assert.equal(view.getByLabelText('새 할 일').value, '작성 중')
})

test('editing invalidates an older read and defers return refresh until editing ends', async () => {
  const view = mount()
  await view.findByLabelText('지난 할 일 더보기')
  let finish
  view.options.todos = () => new Promise(resolve => { finish = resolve })
  returnToTab()
  await waitFor(() => assert.equal(view.calls.reads.length, 2))
  fireEvent.click(view.getByLabelText('지난 할 일 더보기'))
  fireEvent.click(view.getByRole('button', { name: '수정하기' }))
  fireEvent.change(view.getByLabelText('할 일 수정'), { target: { value: '수정 내용 보호' } })
  await act(async () => finish([]))
  returnToTab()
  await flushReturnEvents()
  assert.equal(view.calls.reads.length, 2)
  assert.equal(view.getByLabelText('할 일 수정').value, '수정 내용 보호')
  view.options.todos = () => [{ ...item, id: 'remote', title: '편집 후 최신 기록' }]
  fireEvent.click(view.getByRole('button', { name: '취소', exact: true }))
  await view.findByText('편집 후 최신 기록')
})

test('background failure keeps previous todos and draft, and retry recovers without an empty list', async () => {
  const view = mount()
  await view.findByLabelText('지난 할 일 더보기')
  fireEvent.change(view.getByLabelText('새 할 일'), { target: { value: '오류 중에도 유지' } })
  view.options.todos = () => { throw new Error('복귀 조회 실패') }
  returnToTab()
  await view.findByText('복귀 조회 실패')
  assert.ok(view.getByLabelText('지난 할 일 더보기'))
  assert.equal(view.getByLabelText('새 할 일').value, '오류 중에도 유지')
  assert.equal(view.queryByText('아직 등록한 할 일이 없어요.'), null)
  view.options.todos = () => [{ ...item, title: '복구된 목록' }]
  fireEvent.click(view.getByRole('button', { name: '다시 불러오기' }))
  await view.findByText('복구된 목록')
  assert.equal(view.queryByText('복귀 조회 실패'), null)
})

test('historical return reloads receipts for today and clears invalid carry selections', async () => {
  const view = mount()
  view.past()
  await waitFor(() => assert.equal(view.getByLabelText('지난 할 일 이월 선택').disabled, false))
  fireEvent.click(view.getByLabelText('지난 할 일 이월 선택'))
  view.options.receipts = () => new Set(['source'])
  returnToTab()
  await view.findByText('오늘로 이월됨')
  assert.equal(view.getByLabelText('할 일 조회 날짜').value, '2026-09-29')
  assert.deepEqual(view.calls.receipts.at(-1), ['owner', '2026-09-30'])
  assert.equal(view.getByLabelText('지난 할 일 이월 선택').checked, false)
  assert.equal(view.getByRole('button', { name: '오늘로 가져오기' }).disabled, true)
})

test('a pre-save read cannot overwrite the mutation refresh and return events wait for saving', async () => {
  let oldRead, finishSave
  const view = mount({ create: () => new Promise(resolve => { finishSave = resolve }) })
  await view.findByLabelText('지난 할 일 더보기')
  view.options.todos = () => new Promise(resolve => { oldRead = resolve })
  returnToTab()
  await waitFor(() => assert.equal(view.calls.reads.length, 2))
  fireEvent.change(view.getByLabelText('새 할 일'), { target: { value: '저장할 항목' } })
  fireEvent.click(view.getByRole('button', { name: '추가' }))
  returnToTab()
  await flushReturnEvents()
  assert.equal(view.calls.reads.length, 2)
  view.options.todos = () => [{ ...item, id: 'new', title: '저장할 항목' }]
  await act(async () => finishSave())
  await view.findByLabelText('저장할 항목 더보기')
  assert.equal(view.calls.reads.length, 3)
  await act(async () => oldRead([]))
  assert.ok(view.getByLabelText('저장할 항목 더보기'))
  assert.equal(view.queryByText('아직 등록한 할 일이 없어요.'), null)
})

test('old account return response and queued timers cannot update a new or unmounted Today screen', async () => {
  const view = mount()
  await view.findByLabelText('지난 할 일 더보기')
  let finish
  view.options.todos = () => new Promise(resolve => { finish = resolve })
  returnToTab()
  await waitFor(() => assert.equal(view.calls.reads.length, 2))
  view.options.todos = (_date, uid) => [{ ...item, userId: uid, title: '다른 계정 목록' }]
  view.setUser('other')
  await view.findByText('다른 계정 목록')
  await act(async () => finish([{ ...item, title: '이전 계정 응답' }]))
  assert.equal(view.queryByText('이전 계정 응답'), null)
  returnToTab()
  const count = view.calls.reads.length
  view.unmount()
  await flushReturnEvents()
  assert.equal(view.calls.reads.length, count)
})

test('editing compares with the original title and cancel or reverting removes date protection', async () => {
  const view = mount()
  await view.findByLabelText('지난 할 일 더보기')
  fireEvent.click(view.getByLabelText('지난 할 일 더보기'))
  fireEvent.click(view.getByRole('button', { name: '수정하기' }))
  fireEvent.change(view.getByLabelText('할 일 수정'), { target: { value: '수정 중' } })
  view.past()
  fireEvent.click(within(view.getByRole('dialog')).getByRole('button', { name: '취소', exact: true }))
  assert.equal(view.getByLabelText('할 일 수정').value, '수정 중')
  fireEvent.change(view.getByLabelText('할 일 수정'), { target: { value: item.title } })
  await act(async () => view.past())
  assert.equal(view.queryByRole('dialog'), null)
  fireEvent.click(view.getByRole('button', { name: '오늘로', exact: true }))
  await view.findByLabelText('지난 할 일 더보기')
  fireEvent.click(view.getByLabelText('지난 할 일 더보기'))
  fireEvent.click(view.getByRole('button', { name: '수정하기' }))
  fireEvent.change(view.getByLabelText('할 일 수정'), { target: { value: '버릴 수정' } })
  fireEvent.click(view.getByRole('button', { name: '취소', exact: true }))
  await act(async () => view.past())
  assert.equal(view.queryByRole('dialog'), null)
})

for (const editing of [false, true]) {
  test(`midnight preserves ${editing ? 'edited' : 'new'} input and today navigation asks before discarding`, async () => {
    const view = mount()
    await view.findByLabelText('지난 할 일 더보기')
    if (editing) {
      fireEvent.click(view.getByLabelText('지난 할 일 더보기'))
      fireEvent.click(view.getByRole('button', { name: '수정하기' }))
    }
    const label = editing ? '할 일 수정' : '새 할 일'
    fireEvent.change(view.getByLabelText(label), { target: { value: '자정 전 작성' } })
    view.setToday('2026-10-01')
    assert.ok(view.getByRole('dialog', { name: '날짜 변경' }))
    assert.equal(view.getByLabelText(label).value, '자정 전 작성')
    // Only the dialog's cancel button is accessible in a real modal browser.
    fireEvent.click(view.getAllByRole('button', { name: '취소', exact: true }).at(-1))
    assert.equal(view.getByLabelText('할 일 조회 날짜').value, '2026-09-30')
    assert.equal(view.getByLabelText(label).value, '자정 전 작성')
    assert.equal(view.getByRole('button', { name: editing ? '저장' : '추가', exact: true }).disabled, true)
    view.setToday('2026-10-01')
    assert.equal(view.queryByRole('dialog'), null)
    fireEvent.click(view.getByRole('button', { name: '오늘로', exact: true }))
    assert.ok(view.getByRole('dialog', { name: '날짜 변경' }))
    fireEvent.click(view.getByRole('button', { name: '이동하기' }))
    await view.findByLabelText('새 할 일')
    assert.equal(view.getByLabelText('할 일 조회 날짜').value, '2026-10-01')
    assert.equal(view.getByLabelText('새 할 일').value, '')
    assert.deepEqual(view.calls.create, [])
    assert.deepEqual(view.calls.rename, [])
  })
}

for (const fail of [false, true]) {
  test(`midnight waits for a pending save, then ${fail ? 'protects failed input' : 'moves without asking after success'}`, async () => {
    let finish, reject
    const view = mount({ create: () => new Promise((resolve, fail) => { finish = resolve; reject = fail }) })
    await waitFor(() => assert.equal(view.getByLabelText('새 할 일').disabled, false))
    fireEvent.change(view.getByLabelText('새 할 일'), { target: { value: '저장 중인 할 일' } })
    fireEvent.click(view.getByRole('button', { name: '추가' }))
    view.setToday('2026-10-01')
    assert.equal(view.getByLabelText('할 일 조회 날짜').disabled, true)
    assert.equal(view.queryByRole('dialog'), null)
    assert.deepEqual(view.calls.create[0], ['new', 'owner', '2026-09-30', '저장 중인 할 일'])
    await act(async () => { if (fail) reject(new Error('저장 실패')); else finish() })
    if (fail) {
      assert.ok(view.getByRole('dialog', { name: '날짜 변경' }))
      await act(async () => fireEvent.click(view.getByRole('button', { name: '취소', exact: true })))
      assert.equal(view.getByLabelText('새 할 일').value, '저장 중인 할 일')
      assert.equal(view.getByLabelText('할 일 조회 날짜').value, '2026-09-30')
    } else {
      assert.equal(view.queryByRole('dialog'), null)
      assert.equal(view.getByLabelText('할 일 조회 날짜').value, '2026-10-01')
      assert.equal(view.getByLabelText('새 할 일').value, '')
    }
  })
}

test('clean midnight advances today, keeps historical selection, and account change clears draft and dialog', async () => {
  const view = mount()
  await view.findByLabelText('새 할 일')
  view.setToday('2026-10-01')
  assert.equal(view.getByLabelText('할 일 조회 날짜').value, '2026-10-01')
  view.past()
  view.setToday('2026-10-02')
  assert.equal(view.getByLabelText('할 일 조회 날짜').value, '2026-09-29')
  fireEvent.click(view.getByRole('button', { name: '오늘로', exact: true }))
  await waitFor(() => assert.equal(view.getByLabelText('새 할 일').disabled, false))
  fireEvent.change(view.getByLabelText('새 할 일'), { target: { value: '이전 계정 내용' } })
  view.past()
  assert.ok(view.getByRole('dialog'))
  view.setUser('other')
  await waitFor(() => assert.equal(view.getByLabelText('새 할 일').disabled, false))
  assert.equal(view.queryByRole('dialog'), null)
  assert.equal(view.getByLabelText('새 할 일').value, '')
  assert.equal(view.getByLabelText('할 일 조회 날짜').value, '2026-10-02')
})

test('successful editing removes protection and a late save cannot affect another account', async () => {
  const view = mount()
  await view.findByLabelText('지난 할 일 더보기')
  fireEvent.click(view.getByLabelText('지난 할 일 더보기'))
  fireEvent.click(view.getByRole('button', { name: '수정하기' }))
  fireEvent.change(view.getByLabelText('할 일 수정'), { target: { value: '저장할 수정' } })
  fireEvent.click(view.getByRole('button', { name: '저장', exact: true }))
  await waitFor(() => assert.equal(view.getByLabelText('할 일 조회 날짜').disabled, false))
  await act(async () => view.past())
  assert.equal(view.queryByRole('dialog'), null)
  fireEvent.click(view.getByRole('button', { name: '오늘로', exact: true }))
  await waitFor(() => assert.equal(view.getByLabelText('새 할 일').disabled, false))
  let finish
  view.options.create = () => new Promise(resolve => { finish = resolve })
  fireEvent.change(view.getByLabelText('새 할 일'), { target: { value: '이전 계정 저장 중' } })
  fireEvent.click(view.getByRole('button', { name: '추가' }))
  view.setUser('other')
  await waitFor(() => assert.equal(view.getByLabelText('새 할 일').disabled, false))
  fireEvent.change(view.getByLabelText('새 할 일'), { target: { value: '새 계정 작성 중' } })
  await act(async () => finish())
  assert.equal(view.getByLabelText('새 할 일').value, '새 계정 작성 중')
  assert.equal(view.queryByRole('dialog'), null)
})

test('useToday updates at midnight and tab return and cleans up its timer on unmount', t => {
  const { useToday } = loader({ '../lib/todos': { localDate: (now = new Date()) =>
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
  } })('../src/hooks/useToday.ts')
  function Clock() { return createElement('output', null, useToday()) }
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: new Date(2026, 8, 30, 23, 59, 59, 900).getTime() })
  const view = render(createElement(Clock))
  assert.ok(view.getByText('2026-09-30'))
  act(() => t.mock.timers.tick(300))
  assert.ok(view.getByText('2026-10-01'))
  t.mock.timers.setTime(new Date(2026, 9, 2, 12).getTime())
  act(() => window.dispatchEvent(new window.Event('focus')))
  assert.ok(view.getByText('2026-10-02'))
  t.mock.timers.setTime(new Date(2026, 9, 3, 12).getTime())
  act(() => document.dispatchEvent(new window.Event('visibilitychange')))
  assert.ok(view.getByText('2026-10-03'))
  view.unmount()
  act(() => t.mock.timers.tick(86_400_000))
  assert.equal(view.container.childElementCount, 0)
})

test('midnight keeps a historical date and blocks carry until the new day receipts are loaded', async () => {
  let finish
  const reads = []
  const view = mount({ receipts: (uid, date) => {
    reads.push([uid, date])
    if (date === '2026-10-01') return new Promise(resolve => { finish = resolve })
    return new Set()
  } })
  view.past()
  await waitFor(() => assert.equal(view.getByLabelText('지난 할 일 이월 선택').disabled, false))
  view.setToday('2026-10-01')
  assert.equal(view.getByLabelText('할 일 조회 날짜').value, '2026-09-29')
  assert.equal(view.getByLabelText('지난 할 일 이월 선택').disabled, true)
  await waitFor(() => assert.deepEqual(reads.at(-1), ['owner', '2026-10-01']))
  await act(async () => finish(new Set(['source'])))
  assert.ok(view.getByText('오늘로 이월됨'))
})

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

test('create failure keeps input and retries the same ID without duplicate submission', async () => {
  let fail = true, finish
  const view = mount({ todos: () => [], create: async () => { if (fail) throw new Error('저장 실패'); await new Promise(resolve => { finish = resolve }) } })
  const input = view.getByLabelText('새 할 일')
  await waitFor(() => assert.equal(input.disabled, false))
  fireEvent.change(input, { target: { value: '새 할 일 제목' } })
  fireEvent.click(view.getByRole('button', { name: '추가' }))
  await view.findByText('저장 실패')
  assert.equal(input.value, '새 할 일 제목')
  fail = false
  fireEvent.click(view.getByRole('button', { name: '추가' }))
  await waitFor(() => assert.ok(finish))
  fireEvent.submit(input.closest('form'))
  assert.equal(view.calls.create.length, 2)
  assert.equal(view.calls.create[0][0], view.calls.create[1][0])
  assert.equal(input.disabled, true)
  await act(async () => finish())
  await waitFor(() => assert.equal(input.value, ''))
})

test('labeled date picker preserves past navigation, future limit and today reset', async () => {
  const dates = []
  const view = mount({ todos: date => { dates.push(date); return [] } })
  const dateInput = () => view.getByLabelText('할 일 조회 날짜')
  assert.equal(dateInput().type, 'date')
  assert.equal(dateInput().min, '0001-01-01')
  assert.equal(dateInput().max, '2026-09-30')
  assert.equal(dateInput().tabIndex, 0)
  await view.findByText('아직 등록한 할 일이 없어요.')
  fireEvent.change(dateInput(), { target: { value: '2026-10-01' } })
  assert.deepEqual(dates, ['2026-09-30'])
  fireEvent.change(dateInput(), { target: { value: '2026-09-29' } })
  await view.findByText('이 날짜에 등록한 할 일이 없어요.')
  assert.equal(dateInput().value, '2026-09-29')
  fireEvent.click(view.getByRole('button', { name: '오늘로', exact: true }))
  await view.findByText('아직 등록한 할 일이 없어요.')
  assert.equal(dateInput().value, '2026-09-30')
})
