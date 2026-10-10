import { readFileSync } from 'node:fs'
import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { JSDOM } from 'jsdom'
import ts from 'typescript'

const dom = new JSDOM('<html><body></body></html>')
globalThis.window = dom.window
globalThis.document = dom.window.document
globalThis.HTMLElement = dom.window.HTMLElement
globalThis.IS_REACT_ACT_ENVIRONMENT = true
const { render, act, cleanup, fireEvent } = await import('@testing-library/react')
const { createElement, StrictMode } = await import('react')
const require = createRequire(import.meta.url)
afterEach(cleanup)

function mount(pathname) {
  const subscriptions = []
  const navigations = []
  let reloads = 0
  const browser = { location: { pathname, replace: path => navigations.push(path), reload: () => reloads++ } }
  function load(file, mocks) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8')
    const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText
    const exports = {}
    new Function('exports', 'require', 'window', output)(exports, id => mocks[id] ?? require(id), browser)
    return exports
  }
  const guard = load('../src/components/auth/GuestOnly.tsx', {
    '../../lib/firebase': { auth: {} },
    'firebase/auth': { onAuthStateChanged: (_auth, next, error) => {
      const subscription = { next, error, closed: false }
      subscriptions.push(subscription)
      return () => { subscription.closed = true }
    } },
  })
  const mocks = {
    './components/common/PageLoader': { __esModule: true, default: ({ children }) => children },
    './components/auth/GuestOnly': guard,
    './lib/navigation': { mainPages: [] },
    './components/common/MainLayout': { __esModule: true, default: () => null },
  }
  for (const page of ['ResetPasswordPage', 'ComingSoonPage', 'DashboardPage', 'LoginPage', 'SignupPage', 'TodayPage', 'StudyPage', 'InterviewPage']) {
    mocks[`./pages/${page}`] = { __esModule: true, default: () => createElement('div', null, page) }
  }
  const app = load('../src/App.tsx', mocks)
  const view = render(createElement(StrictMode, null, createElement(app.default)))
  return { ...view, navigations, subscriptions, reloads: () => reloads,
    emit: user => act(() => subscriptions.filter(s => !s.closed).forEach(s => s.next(user))),
    fail: () => act(() => subscriptions.filter(s => !s.closed).forEach(s => s.error(new Error('auth failed')))),
  }
}

for (const path of ['/', '/login', '/signup', '/login/', '/signup/']) {
  test(`signed-in entry to ${path} replaces the URL without rendering a form`, () => {
    const view = mount(path)
    assert.ok(view.getByRole('status'))
    assert.equal(view.queryByText(/^(LoginPage|SignupPage)$/), null)
    view.emit({ uid: 'existing' })
    assert.deepEqual(view.navigations, ['/dashboard'])
    assert.equal(view.queryByText(/^(LoginPage|SignupPage)$/), null)
  })
}

test('guest can open login and signup pages', async () => {
  for (const path of ['/', '/login', '/signup']) {
    const view = mount(path)
    view.emit(null)
    assert.ok(await view.findByText(path === '/signup' ? 'SignupPage' : 'LoginPage'))
    assert.deepEqual(view.navigations, [])
    cleanup()
  }
})

test('signup auth changes preserve the admitted form for profile and sign-out retries', async () => {
  const view = mount('/signup')
  view.emit(null)
  const form = await view.findByText('SignupPage')
  view.emit({ uid: 'new-account' })
  assert.equal(view.getByText('SignupPage'), form)
  view.emit(null)
  assert.equal(view.getByText('SignupPage'), form)
  assert.deepEqual(view.navigations, [])
  view.unmount()
  assert.ok(view.subscriptions.every(s => s.closed))
})

test('initial auth failure shows retry without rendering forms or redirecting', () => {
  const view = mount('/login')
  view.fail()
  assert.ok(view.getByRole('alert'))
  assert.equal(view.queryByText('LoginPage'), null)
  assert.deepEqual(view.navigations, [])
  fireEvent.click(view.getByRole('button', { name: '다시 시도' }))
  assert.equal(view.reloads(), 1)
})
