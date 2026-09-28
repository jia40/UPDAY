import { readFileSync } from 'node:fs'
import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { JSDOM } from 'jsdom'
import ts from 'typescript'
import { FirebaseError } from 'firebase/app'
const dom = new JSDOM('<html><body></body></html>', { url: 'http://localhost' })
globalThis.window = dom.window
globalThis.document = dom.window.document
globalThis.HTMLElement = dom.window.HTMLElement
globalThis.IS_REACT_ACT_ENVIRONMENT = true
const { render, fireEvent, waitFor, cleanup, act } = await import('@testing-library/react')
const { createElement } = await import('react')
const require = createRequire(import.meta.url)
afterEach(cleanup)
function mount(options = {}) {
  const calls = []
  const auth = {}
  const source = readFileSync(new URL('../src/pages/ResetPasswordPage.tsx', import.meta.url), 'utf8')
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText
  const exports = {}
  new Function('exports', 'require', output)(exports, id => {
    if (id === 'firebase/app') return { FirebaseError }
    if (id === 'firebase/auth') return { sendPasswordResetEmail: async (...args) => { calls.push(args); await options.request?.() } }
    if (id === '../lib/firebase') return { auth }
    if (id.endsWith('.css')) return {}
    return require(id)
  })
  const view = render(createElement(exports.default))
  return { ...view, calls, auth, options,
    change: value => fireEvent.change(view.getByLabelText('이메일'), { target: { value } }),
    submit: () => fireEvent.submit(view.container.querySelector('form')),
  }
}
for (const input of ['', '   ', 'bad', 'a@b', 'a b@test.com', 'a@@test.com']) {
  test(`reject invalid email ${JSON.stringify(input)} before sending`, () => {
    const view = mount(); view.change(input); view.submit()
    assert.equal(view.calls.length, 0)
    assert.ok(view.getByRole('alert'))
    assert.equal(view.getByLabelText('이메일').getAttribute('aria-invalid'), 'true')
  })
}
test('trim email, lock pending form and duplicate requests, show completion and login link', async () => {
  let resolve
  const view = mount({ request: () => new Promise(done => { resolve = done }) })
  view.change('  person@example.com  ')
  const form = view.container.querySelector('form')
  act(() => { fireEvent.submit(form); fireEvent.submit(form) })
  assert.deepEqual(view.calls, [[view.auth, 'person@example.com']])
  assert.equal(view.getByLabelText('이메일').disabled, true)
  assert.equal(view.getByRole('button').disabled, true)
  await act(async () => resolve())
  assert.match(view.getByRole('status').textContent, /재설정이 가능한 계정이라면.*스팸함/)
  assert.equal(view.queryByRole('button'), null)
  assert.equal(view.getByRole('link', { name: '로그인 화면으로 돌아가기' }).getAttribute('href'), '/login')
})
test('unknown email has exactly the same completion as success', async () => {
  const success = mount(); success.change('known@example.com'); success.submit()
  const message = (await success.findByRole('status')).textContent
  cleanup()
  const missing = mount({ request: () => { throw new FirebaseError('auth/user-not-found', '') } })
  missing.change('missing@example.com'); missing.submit()
  await waitFor(() => assert.equal(missing.getByRole('status').textContent, message))
  assert.equal(missing.queryByRole('alert'), null)
})
for (const [error, text] of [
  [new FirebaseError('auth/network-request-failed', ''), /네트워크 연결/],
  [new FirebaseError('auth/too-many-requests', ''), /요청이 너무 많습니다/],
  [new FirebaseError('auth/invalid-email', ''), /올바른 이메일/],
  [new Error('sensitive server response'), /요청을 처리하지 못했습니다/],
]) {
  test(`failure ${error.code ?? 'unknown'} retains input and permits retry`, async () => {
    const view = mount({ request: () => { throw error } })
    view.change('person@example.com'); view.submit()
    await waitFor(() => assert.match(view.getByRole('alert').textContent, text))
    assert.equal(view.getByLabelText('이메일').value, 'person@example.com')
    assert.equal(view.getByRole('button').disabled, false)
    delete view.options.request
    view.submit()
    await waitFor(() => assert.match(view.getByRole('status').textContent, /스팸함/))
    assert.equal(view.calls.length, 2)
  })
}
test('public reset route bypasses protected layout and is linked from login', () => {
  function load(path, mocks, window) {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8')
    const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText
    const exports = {}
    new Function('exports','require','window',output)(exports, id => {
      if (id in mocks) return mocks[id]
      if (id.startsWith('.')) return { default: () => { throw new Error(`unexpected protected component: ${id}`) } }
      return require(id)
    }, window)
    return exports.default
  }
  const App = load('../src/App.tsx', { './pages/ResetPasswordPage': { __esModule: true, default: () => createElement('h1', null, 'reset route') } }, { location: { pathname: '/reset-password/' } })
  assert.ok(render(createElement(App)).getByRole('heading', { name: 'reset route' }))
  cleanup()
  const Login = load('../src/pages/LoginPage.tsx', { 'firebase/app': { FirebaseError }, 'firebase/auth': {}, '../lib/firebase': { auth: {} } }, {})
  const view = render(createElement(Login))
  assert.equal(view.getByRole('link', { name: '비밀번호를 잊으셨나요?' }).getAttribute('href'), '/reset-password')
})
