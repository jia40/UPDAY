import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import ts from 'typescript'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<html><body></body></html>')
globalThis.window = dom.window
globalThis.document = dom.window.document
globalThis.HTMLElement = dom.window.HTMLElement
globalThis.IS_REACT_ACT_ENVIRONMENT = true
const { render, cleanup, act, fireEvent } = await import('@testing-library/react')
const { createElement, lazy } = await import('react')
const require = createRequire(import.meta.url)
afterEach(cleanup)

function load(path, mocks = {}, browser = window) {
  const output = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText
  const exports = {}
  new Function('exports', 'require', 'window', output)(exports, id => id in mocks ? mocks[id] : require(id), browser)
  return exports
}
const PageLoader = load('../src/components/common/PageLoader.tsx').default

test('lazy page shows loading and replaces it with content', async () => {
  let finish
  const Page = lazy(() => new Promise(resolve => { finish = resolve }))
  const view = render(createElement(PageLoader, null, createElement(Page)))
  assert.match(view.getByRole('status').textContent, /불러오고/)
  await act(async () => finish({ default: () => createElement('h1', null, 'loaded') }))
  assert.ok(view.getByText('loaded'))
  assert.equal(view.queryByRole('status'), null)
})

test('failed page load offers reload recovery', async () => {
  let fail, reloads = 0
  const Boundary = load('../src/components/common/PageLoader.tsx', {}, { location: { reload: () => reloads++ } }).default
  const Page = lazy(() => new Promise((_resolve, reject) => { fail = reject }))
  const view = render(createElement(Boundary, null, createElement(Page)))
  const original = console.error
  console.error = () => {}
  try { await act(async () => fail(new Error('chunk unavailable'))) } finally { console.error = original }
  assert.ok(view.getByRole('alert'))
  fireEvent.click(view.getByRole('button', { name: '다시 불러오기' }))
  assert.equal(reloads, 1)
})

test('routes import only their page and set titles for direct paths and trailing slashes', async () => {
  const { mainPages } = load('../src/lib/navigation.ts')
  const paths = [
    ['/', '로그인', 'LoginPage'], ['/login/', '로그인', 'LoginPage'], ['/signup', '회원가입', 'SignupPage'],
    ['/reset-password/', '비밀번호 재설정', 'ResetPasswordPage'], ['/dashboard', '대시보드', 'DashboardPage'],
    ['/today', '오늘 할 일', 'TodayPage'], ['/study', '학습 기록', 'StudyPage'], ['/interview', '면접 준비', 'InterviewPage'],
    ['/job', '취업 지원', 'ComingSoonPage'], ['/mypage', '마이페이지', 'ComingSoonPage'], ['/missing', '페이지를 찾을 수 없음', null],
  ]
  for (const [pathname, title, page] of paths) {
    const imports = []
    const mocks = {
      './lib/navigation': { mainPages },
      './components/common/PageLoader': { __esModule: true, default: PageLoader },
      './components/auth/GuestOnly': { __esModule: true, default: ({ children }) => children },
      './components/common/MainLayout': { __esModule: true, default: ({ children }) => children },
    }
    const output = ts.transpileModule(readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText
    const exports = {}
    new Function('exports', 'require', 'window', output)(exports, id => {
      if (id.startsWith('./pages/')) { imports.push(id); return { __esModule: true, default: () => createElement('h1', null, id) } }
      return mocks[id] ?? require(id)
    }, { location: { pathname } })
    const view = render(createElement(exports.default))
    assert.equal(document.title, `Upday | ${title}`)
    if (page) { await view.findByText(`./pages/${page}`); assert.deepEqual(imports, [`./pages/${page}`]) }
    else { assert.ok(view.getByText('페이지를 찾을 수 없습니다.')); assert.deepEqual(imports, []) }
    cleanup()
  }
})
