import { readFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import ts from 'typescript'
import { JSDOM } from 'jsdom'
const dom = new JSDOM('<html><body></body></html>', { url: 'http://localhost/study?new=1' })
for (const name of ['window', 'document', 'HTMLElement', 'HTMLAnchorElement', 'Element', 'Node']) globalThis[name] = name === 'window' ? dom.window : name === 'document' ? dom.window.document : dom.window[name]
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator })
globalThis.IS_REACT_ACT_ENVIRONMENT = true
dom.window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
dom.window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
const { render, fireEvent, waitFor, cleanup, act } = await import('@testing-library/react')
const { createElement } = await import('react')
const require = createRequire(import.meta.url)
afterEach(cleanup)

function mount({ edit = false, detail = false, save = async () => {}, logs, logout } = {}) {
  window.history.replaceState({}, '', edit ? '/study?record=one&edit=1' : detail ? '/study?record=one' : '/study?new=1')
  let userId = 'owner'
  const navigation = []
  const cache = new Map()
  const record = { id: 'one', title: '원래 제목', content: '원래 내용', tags: ['React'], studyMinutes: 65, studyDate: '2026-09-30', createdAt: { toDate: () => new Date('2026-09-30T12:00:00') } }
  function load(path) {
    let url = new URL(path, import.meta.url)
    if (!/\.tsx?$/.test(url.pathname)) url = new URL(url.href + (existsSync(new URL(url.href + '.tsx')) ? '.tsx' : '.ts'))
    if (cache.has(url.href)) return cache.get(url.href)
    const output = ts.transpileModule(readFileSync(url, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText
    const exports = {}
    const scopedWindow = {
      location: { get search() { return window.location.search }, get href() { return window.location.href }, get origin() { return window.location.origin }, get pathname() { return window.location.pathname }, assign: url => navigation.push(url), replace: url => navigation.push(url) },
      addEventListener: window.addEventListener.bind(window), removeEventListener: window.removeEventListener.bind(window),
    }
    new Function('exports', 'require', 'window', output)(exports, id => {
      if (id.endsWith('.css')) return {}
      if (id === 'firebase/auth') return { signOut: logout ?? (async () => {}) }
      if (id.endsWith('/firebase')) return { auth: {} }
      if (id.endsWith('/useAuth')) return { useAuth: () => ({ user: { uid: userId }, isLoading: false }) }
      if (id.endsWith('/useToday')) return { useToday: () => '2026-10-02' }
      if (id.endsWith('/studyLogs')) return { fetchStudyLog: async () => logs ? (await logs(userId))[0] ?? null : record, fetchStudyOverview: () => { throw new Error('Form must not fetch overview') }, validateStudy: () => {}, newStudyId: () => 'new', createStudyLog: save, updateStudyLog: save, deleteStudyLog: save }
      if (id.endsWith('/StudyHeatmap') || id.endsWith('/StudyWeeklyStats')) return { __esModule: true, default: () => null }
      if (id.startsWith('.')) return load(new URL(id, url).href)
      return require(id)
    }, scopedWindow)
    cache.set(url.href, exports)
    return exports
  }
  const page = load('../src/pages/StudyPage.tsx')
  const Provider = load('../src/components/auth/LogoutGuard.tsx').LogoutGuardProvider
  const Header = load('../src/components/common/Header.tsx').default
  const screen = () => createElement(Provider, null, logout ? createElement(Header, { pathname: '/study' }) : createElement('a', { href: '/dashboard' }, '대시보드 메뉴'), createElement(page.default))
  const view = render(screen())
  const change = (id, value) => fireEvent.change(view.container.querySelector(`#${id}`), { target: { value } })
  const unload = () => { const event = new window.Event('beforeunload', { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented }
  return { ...view, navigation, change, unload, setUser: (id) => { userId = id; view.rerender(screen()) }, ready: () => waitFor(() => assert.equal(view.container.querySelector('fieldset')?.disabled, false)) }
}

for (const edit of [false, true]) test(`dirty ${edit ? 'edit' : 'new'} form confirms logout and cancellation preserves input`, async () => {
  let calls = 0
  const view = mount({ edit, logout: async () => { calls++ } })
  await view.ready(); view.change('study-title', '작성 중')
  fireEvent.click(view.getByRole('button', { name: '로그아웃' }))
  await view.findByRole('button', { name: '계속 작성' })
  assert.equal(calls, 0)
  fireEvent.click(view.getByRole('button', { name: '계속 작성' }))
  await view.ready()
  assert.equal(view.getByLabelText('제목 *').value, '작성 중')
  assert.equal(view.unload(), true)
  assert.deepEqual(view.navigation, [])
  fireEvent.click(view.getByRole('button', { name: '로그아웃' }))
  await view.findByRole('button', { name: '계속 작성' })
  await act(async () => fireEvent.click(view.getByRole('button', { name: '로그아웃', exact: true })))
  assert.equal(calls, 1)
  assert.deepEqual(view.navigation, ['/login'])
})

test('logout failure retains the dirty form and allows a confirmed retry', async () => {
  let calls = 0
  const view = mount({ logout: async () => { if (++calls === 1) throw new Error('offline') } })
  await view.ready(); view.change('study-title', '작성 중')
  fireEvent.click(view.getByRole('button', { name: '로그아웃' }))
  await view.findByRole('button', { name: '계속 작성' })
  await act(async () => fireEvent.click(view.getByRole('button', { name: '로그아웃', exact: true })))
  await view.findByText('로그아웃에 실패했습니다. 잠시 후 다시 시도해주세요.')
  await view.ready()
  assert.equal(view.getByLabelText('제목 *').value, '작성 중')
  assert.equal(view.unload(), true)
  assert.deepEqual(view.navigation, [])
  fireEvent.click(view.getByRole('button', { name: '로그아웃' }))
  await view.findByRole('button', { name: '계속 작성' })
  await act(async () => fireEvent.click(view.getByRole('button', { name: '로그아웃', exact: true })))
  assert.equal(calls, 2)
})

test('pending save blocks logout and a failed save restores confirmation', async () => {
  let reject, calls = 0
  const view = mount({ save: () => new Promise((_resolve, fail) => { reject = fail }), logout: async () => { calls++ } })
  await view.ready(); view.change('study-title', '작성 중'); view.change('study-minutes', '10')
  fireEvent.submit(view.container.querySelector('form'))
  await act(async () => fireEvent.click(view.getByRole('button', { name: '로그아웃' })))
  assert.equal(calls, 0)
  assert.equal(view.queryByRole('button', { name: '계속 작성' }), null)
  await act(async () => reject(new Error('저장 실패')))
  fireEvent.click(view.getByRole('button', { name: '로그아웃' }))
  await view.findByRole('button', { name: '계속 작성' })
  assert.equal(calls, 0)
})

test('clean forms and form unmounts do not leave a logout guard', async () => {
  let calls = 0
  const view = mount({ logout: async () => { calls++ } })
  await view.ready()
  await act(async () => fireEvent.click(view.getByRole('button', { name: '로그아웃' })))
  assert.equal(calls, 1)
  view.change('study-title', '이전 계정')
  fireEvent.click(view.getByRole('button', { name: '로그아웃' }))
  await view.findByRole('button', { name: '계속 작성' })
  view.setUser('other')
  await view.ready()
  assert.equal(view.queryByRole('button', { name: '계속 작성' }), null)
  await act(async () => fireEvent.click(view.getByRole('button', { name: '로그아웃' })))
  assert.equal(calls, 2)
})

test('all fields guard unsaved input and reverting each field removes the guard', async () => {
  const view = mount(); await view.ready()
  assert.equal(view.unload(), false)
  for (const [id, value, initial] of [['study-title', '제목', ''], ['study-content', '내용', ''], ['study-date', '2026-10-01', '2026-10-02'], ['study-hours', '1', ''], ['study-minutes', '5', ''], ['study-tags', 'React', '']]) {
    view.change(id, value); assert.equal(view.unload(), true, id)
    view.change(id, initial); assert.equal(view.unload(), false, id)
  }
  fireEvent.click(view.getByRole('button', { name: '취소', exact: true }))
  assert.deepEqual(view.navigation, ['/study'])
})

test('internal menu confirmation preserves input or follows the chosen destination without double warning', async () => {
  const view = mount(); await view.ready(); view.change('study-title', '작성 중')
  fireEvent.click(view.getByText('대시보드 메뉴'))
  assert.ok(view.getByRole('button', { name: '계속 작성' }))
  fireEvent.click(view.getByRole('button', { name: '계속 작성' }))
  assert.equal(view.container.querySelector('#study-title').value, '작성 중')
  assert.equal(view.unload(), true)
  fireEvent.click(view.getByText('대시보드 메뉴'))
  fireEvent.click(view.getByRole('button', { name: '나가기' }))
  assert.deepEqual(view.navigation, ['http://localhost/dashboard'])
  assert.equal(view.unload(), false)
  window.dispatchEvent(new window.Event('pageshow'))
  assert.equal(view.unload(), true)
  view.unmount(); assert.equal(view.unload(), false)
})

test('edit baseline is clean after loading and restoring original values removes warning', async () => {
  const view = mount({ edit: true }); await view.ready()
  assert.equal(view.unload(), false)
  view.change('study-content', '수정 내용'); assert.equal(view.unload(), true)
  view.change('study-content', '원래 내용'); assert.equal(view.unload(), false)
  fireEvent.click(view.getByRole('button', { name: '취소', exact: true }))
  assert.deepEqual(view.navigation, ['/study?record=one'])
})

test('dirty cancel shares confirmation and returns to the record', async () => {
  const view = mount({ edit: true }); await view.ready(); view.change('study-hours', '2')
  fireEvent.click(view.getByRole('button', { name: '취소', exact: true }))
  fireEvent.click(view.getByRole('button', { name: '나가기' }))
  assert.deepEqual(view.navigation, ['/study?record=one'])
  assert.equal(view.unload(), false)
})

for (const edit of [false, true]) test(`pending save blocks internal links; failed save preserves guard; successful ${edit ? 'edit' : 'create'} clears it`, async () => {
  let resolve, reject
  const view = mount({ edit, save: () => new Promise((yes, no) => { resolve = yes; reject = no }) })
  await view.ready(); view.change('study-title', '저장 제목'); view.change('study-minutes', '10')
  fireEvent.submit(view.container.querySelector('form'))
  fireEvent.click(view.getByText('대시보드 메뉴'))
  assert.equal(view.queryByRole('button', { name: '나가기' }), null)
  assert.equal(view.unload(), true)
  await act(async () => reject(new Error('저장 실패')))
  assert.equal(view.unload(), true)
  assert.equal(view.container.querySelector('#study-title').value, '저장 제목')
  fireEvent.submit(view.container.querySelector('form'))
  await act(async () => resolve())
  assert.equal(view.unload(), false)
  fireEvent.click(view.getByRole('button', { name: '확인', exact: true }))
  assert.deepEqual(view.navigation, [edit ? '/study?record=one' : '/study?record=new'])
})


test('account change clears unsaved input and ignores the previous save completion', async () => {
  let finish
  const view = mount({ save: () => new Promise(resolve => { finish = resolve }) })
  await view.ready()
  view.change('study-title', '이전 계정 내용')
  view.change('study-minutes', '10')
  fireEvent.submit(view.container.querySelector('form'))
  view.setUser('other')
  await view.ready()
  assert.equal(view.container.querySelector('#study-title').value, '')
  assert.equal(view.unload(), false)
  await act(async () => finish())
  assert.equal(view.queryByRole('button', { name: '확인', exact: true }), null)
  assert.deepEqual(view.navigation, [])
})

test('account change discards a late record response from the previous account', async () => {
  let finish
  const view = mount({ edit: true, logs: user => user === 'owner' ? new Promise(resolve => { finish = resolve }) : Promise.resolve([]) })
  view.setUser('other')
  await view.findByText('학습 기록을 찾을 수 없거나 접근 권한이 없습니다.')
  await act(async () => finish([{ id: 'one', title: '비공개 제목', content: '내용', tags: [], studyMinutes: 1, studyDate: '2026-10-01' }]))
  assert.equal(view.queryByDisplayValue('비공개 제목'), null)
  assert.equal(view.container.querySelector('form'), null)
})


test('detail query retries and delete failure keeps confirmation available for retry', async () => {
  let attempts = 0, deletes = 0
  const record = { id: 'one', title: '상세 제목', content: '상세 내용', tags: ['React'], studyMinutes: 30, studyDate: '2026-10-01' }
  const view = mount({ detail: true, logs: async () => { if (++attempts === 1) throw new Error('조회 실패'); return [record] }, save: async id => { assert.equal(id, 'one'); if (++deletes === 1) throw new Error('삭제 실패') } })
  fireEvent.click(await view.findByRole('button', { name: '다시 불러오기' }))
  await view.findByText('상세 내용')
  fireEvent.click(view.getByRole('button', { name: '상세 제목 더보기' }))
  fireEvent.click(view.getByRole('button', { name: '삭제하기' }))
  await act(async () => fireEvent.click(view.getByRole('button', { name: '삭제하기' })))
  assert.ok(view.getAllByText('삭제 실패').length)
  await act(async () => fireEvent.click(view.getByRole('button', { name: '삭제하기' })))
  assert.equal(deletes, 2)
  fireEvent.click(view.getByRole('button', { name: '확인', exact: true }))
  assert.deepEqual(view.navigation, ['/study'])
})
