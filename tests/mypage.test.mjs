import { readFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import ts from 'typescript'
import { JSDOM } from 'jsdom'
import { FirebaseError } from 'firebase/app'

const require = createRequire(import.meta.url)
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/interview' })
globalThis.window = dom.window
globalThis.document = dom.window.document
globalThis.HTMLElement = dom.window.HTMLElement
globalThis.Element = dom.window.Element
globalThis.HTMLAnchorElement = dom.window.HTMLAnchorElement
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator })
globalThis.IS_REACT_ACT_ENVIRONMENT = true
dom.window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
dom.window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
const { render, fireEvent, waitFor, cleanup, act } = await import('@testing-library/react')
const { createElement } = await import('react')
afterEach(() => { cleanup(); window.history.replaceState({}, '', '/interview') })

function loader(mocks = {}, navigate = () => {}) {
  const cache = new Map()
  function load(path) {
    let url = new URL(path, import.meta.url)
    if (!/\.tsx?$/.test(url.pathname)) url = new URL(url.href + (existsSync(new URL(url.href + '.tsx')) ? '.tsx' : '.ts'))
    if (cache.has(url.href)) return cache.get(url.href)
    const output = ts.transpileModule(readFileSync(url, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText
    const exports = {}
    const scopedWindow = { location: { get search() { return window.location.search }, get href() { return window.location.href }, get origin() { return window.location.origin }, get pathname() { return window.location.pathname }, assign: navigate }, addEventListener: window.addEventListener.bind(window), removeEventListener: window.removeEventListener.bind(window) }
    new Function('exports', 'require', 'window', output)(exports, (id) => {
      if (id in mocks) return mocks[id]
      if (id === 'firebase/app') return { FirebaseError }
      if (id.endsWith('.css')) return {}
      if (id.startsWith('.')) return load(new URL(id, url).href)
      return require(id)
    }, scopedWindow)
    cache.set(url.href, exports)
    return exports
  }
  return load
}

function mount({ user = { uid: 'owner', displayName: '기존 이름', email: 'owner@example.com', metadata: { creationTime: '2026-10-01T00:00:00Z' } }, save = async () => {}, guard = null } = {}) {
  let state = { user, isLoading: false, error: null }
  const firebaseAuth = { currentUser: user }
  const calls = []
  const module = loader({ '../hooks/useAuth': { useAuth: () => state }, '../lib/firebase': { auth: firebaseAuth },
    'firebase/auth': { updateProfile: async (...args) => { calls.push(args); await save(...args); args[0].displayName = args[1].displayName } },
    './useLogoutGuard': { useLogoutGuard: () => guard },
  })('../src/pages/MyPage.tsx')
  const view = render(createElement(module.default))
  return { view, calls, validate: loader()('../src/lib/profile.ts').validateName, setAuth(next) { state = next; firebaseAuth.currentUser = next.user; view.rerender(createElement(module.default)) } }
}
test('profile shows account fields and validates name boundaries', () => {
  const { view, validate } = mount()
  assert.ok(view.getByText('owner@example.com'))
  assert.ok(view.getByText('기존 이름'))
  assert.equal(validate(' 새 이름 '), '새 이름')
  assert.equal(validate('가'.repeat(50)).length, 50)
  for (const name of ['', ' ', '가', '가'.repeat(51)]) assert.throws(() => validate(name))
})
test('unchanged normalized name skips writes and cancel restores stored name', () => {
  const { view, calls } = mount()
  fireEvent.change(view.getByLabelText('이름'), { target: { value: ' 기존 이름 ' } })
  fireEvent.click(view.getByRole('button', { name: '이름 저장' }))
  assert.equal(calls.length, 0)
  assert.equal(view.getByLabelText('이름').value, '기존 이름')
  fireEvent.change(view.getByLabelText('이름'), { target: { value: '새 이름' } })
  fireEvent.click(view.getByRole('button', { name: '수정 취소' }))
  assert.equal(view.getByLabelText('이름').value, '기존 이름')
})
test('save failure retains input; retry locks submissions and updates account information', async () => {
  let fail = true, finish
  const { view, calls } = mount({ save: async () => { if (fail) throw new Error('network'); await new Promise(resolve => { finish = resolve }) } })
  fireEvent.change(view.getByLabelText('이름'), { target: { value: ' 새 이름 ' } })
  fireEvent.click(view.getByRole('button', { name: '이름 저장' }))
  await view.findByText('network')
  assert.equal(view.getByLabelText('이름').value, ' 새 이름 ')
  fail = false
  fireEvent.click(view.getByRole('button', { name: '이름 저장' }))
  await waitFor(() => assert.ok(finish))
  assert.equal(view.getByLabelText('이름').matches(':disabled'), true)
  fireEvent.submit(view.getByLabelText('이름').closest('form'))
  assert.equal(calls.length, 2)
  await act(async () => finish())
  await view.findByText('이름이 저장되었습니다.')
  assert.ok(view.getByText('새 이름'))
  assert.deepEqual(calls[1][1], { displayName: '새 이름' })
  const unload = new window.Event('beforeunload', { cancelable: true }); window.dispatchEvent(unload)
  assert.equal(unload.defaultPrevented, false)
})
test('dirty profile blocks unload and logout cancellation preserves input', async () => {
  let check
  const { view } = mount({ guard: { register: fn => { check = fn; return () => {} }, loggingOut: false } })
  fireEvent.change(view.getByLabelText('이름'), { target: { value: '새 이름' } })
  const unload = new window.Event('beforeunload', { cancelable: true }); window.dispatchEvent(unload)
  assert.equal(unload.defaultPrevented, true)
  let decision
  act(() => { decision = check() })
  fireEvent.click(view.getByRole('button', { name: '계속 수정' }))
  assert.equal(await decision, false)
  assert.equal(view.getByLabelText('이름').value, '새 이름')
})
test('account switch discards draft and late previous-account save result', async () => {
  let finish
  const { view, setAuth } = mount({ save: () => new Promise(resolve => { finish = resolve }) })
  fireEvent.change(view.getByLabelText('이름'), { target: { value: '새 이름' } })
  fireEvent.click(view.getByRole('button', { name: '이름 저장' }))
  await waitFor(() => assert.ok(finish))
  setAuth({ user: { uid: 'other', displayName: '다른 사용자', email: null, metadata: {} }, isLoading: false })
  assert.equal(view.getByLabelText('이름').value, '다른 사용자')
  await act(async () => finish())
  assert.equal(view.getByLabelText('이름').value, '다른 사용자')
  assert.ok(view.getByText('등록된 이메일이 없습니다.'))
  assert.ok(view.getByText('가입일 정보가 없습니다.'))
  assert.equal(view.queryByText('이름이 저장되었습니다.'), null)
})
test('loading, signed out, auth errors and missing profile fields are handled', () => {
  const { view, setAuth } = mount({ user: { uid: 'owner', displayName: null, email: null, metadata: { creationTime: 'invalid' } } })
  assert.ok(view.getByText('등록된 이름이 없습니다.'))
  assert.ok(view.getByText('가입일 정보가 없습니다.'))
  setAuth({ user: null, isLoading: true })
  assert.ok(view.getByRole('status'))
  assert.equal(view.queryByLabelText('이름'), null)
  setAuth({ user: null, isLoading: false, error: '인증 오류' })
  assert.equal(view.getByRole('alert').textContent, '인증 오류')
})

test('saved profile is used by dashboard greeting on next page mount', async () => {
  const user = { uid: 'owner', displayName: '기존 이름', email: 'owner@example.com', metadata: {} }
  const { view } = mount({ user })
  fireEvent.change(view.getByLabelText('이름'), { target: { value: '변경 이름' } })
  fireEvent.click(view.getByRole('button', { name: '이름 저장' }))
  await view.findByText('이름이 저장되었습니다.')
  cleanup()
  const Dashboard = loader({ '../hooks/useAuth': { useAuth: () => ({ user }) }, '../hooks/useToday': { useToday: () => '2026-10-12' },
    '../components/DashboardCareerCard': { __esModule: true, default: () => null }, '../components/DashboardStudyCard': { __esModule: true, default: () => null }, '../components/DashboardTodayCard': { __esModule: true, default: () => null },
  })('../src/pages/DashboardPage.tsx').default
  const dashboard = render(createElement(Dashboard))
  assert.ok(dashboard.getByText('변경 이름님, 오늘도 한 걸음 성장해볼까요?'))
})
test('internal navigation cancellation and logout approval use common guard', async () => {
  let check
  const { view } = mount({ guard: { register: fn => { check = fn; return () => {} }, loggingOut: false } })
  fireEvent.change(view.getByLabelText('이름'), { target: { value: '새 이름' } })
  const link = document.createElement('a'); link.href = '/dashboard'; link.textContent = '이동'; document.body.append(link)
  try {
    fireEvent.click(link)
    assert.ok(view.getByRole('dialog'))
    fireEvent.click(view.getByRole('button', { name: '계속 수정' }))
    assert.equal(view.getByLabelText('이름').value, '새 이름')
    let decision
    act(() => { decision = check() })
    fireEvent.click(view.getByRole('button', { name: '나가기' }))
    assert.equal(await decision, true)
  } finally { link.remove() }
})
