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
function setup() {
  const subscriptions = []
  const auth = { currentUser: null }
  const load = loader({ '../../lib/firebase': { auth }, 'firebase/auth': { onAuthStateChanged: (_auth, next, error) => {
    const sub = { next, error, closed: false }; subscriptions.push(sub)
    return () => { sub.closed = true }
  } } })
  const { useAuth } = load('../src/hooks/useAuth.ts')
  const Provider = load('../src/components/auth/AuthProvider.tsx').default
  const emit = user => { auth.currentUser = user; act(() => subscriptions.filter(sub => !sub.closed).forEach(sub => sub.next(user))) }
  return { subscriptions, auth, useAuth, Provider, emit }
}
test('multiple consumers share one active StrictMode subscription and cleanup ignores late callbacks', async () => {
  const { useAuth, Provider, subscriptions, emit } = setup()
  const { StrictMode } = require('react')
  const renders = []
  function Consumer() { const state = useAuth(); renders.push(state); return createElement('p', null, state.isLoading ? 'loading' : state.user?.uid ?? state.error ?? 'guest') }
  const view = render(createElement(StrictMode, null, createElement(Provider, null, createElement(Consumer), createElement(Consumer))))
  assert.equal(subscriptions.filter(sub => !sub.closed).length, 1)
  assert.ok(subscriptions.length >= 2)
  emit({ uid: 'a' })
  assert.equal(view.getAllByText('a').length, 2)
  assert.equal(renders.at(-1), renders.at(-2))
  emit({ uid: 'b' })
  assert.equal(view.getAllByText('b').length, 2)
  emit(null)
  assert.equal(view.getAllByText('guest').length, 2)
  act(() => subscriptions.filter(sub => !sub.closed)[0].error(new Error('auth')))
  assert.equal(view.getAllByText(/로그인 상태를 확인하지 못했습니다/).length, 2)
  const count = renders.length
  view.unmount()
  assert.ok(subscriptions.every(sub => sub.closed))
  act(() => subscriptions.forEach(sub => sub.next({ uid: 'late' })))
  assert.equal(renders.length, count)
})
test('same-reference profile refresh updates all consumers and ignores previous account refresh', () => {
  const { useAuth, Provider, emit, auth } = setup()
  let refresh
  function Consumer() { const state = useAuth(); refresh = state.refreshProfile; return createElement('p', null, state.user?.displayName ?? 'guest') }
  const view = render(createElement(Provider, null, createElement(Consumer), createElement(Consumer)))
  const user = { uid: 'owner', displayName: '이전 이름' }
  emit(user)
  user.displayName = '변경 이름'
  act(() => refresh(user))
  assert.equal(view.getAllByText('변경 이름').length, 2)
  const other = { uid: 'other', displayName: '다른 사용자' }
  emit(other)
  act(() => refresh(user))
  assert.equal(view.getAllByText('다른 사용자').length, 2)
  assert.equal(auth.currentUser, other)
})
test('useAuth outside provider reports a clear error', () => {
  const { useAuth } = setup()
  function Consumer() { useAuth(); return null }
  const original = console.error; console.error = () => {}
  try { assert.throws(() => render(createElement(Consumer)), /AuthProvider 내부/) } finally { console.error = original }
})
