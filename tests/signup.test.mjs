import { readFileSync } from 'node:fs'
import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { JSDOM } from 'jsdom'
import ts from 'typescript'
import { FirebaseError } from 'firebase/app'

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' })
globalThis.window = dom.window
globalThis.document = dom.window.document
globalThis.HTMLElement = dom.window.HTMLElement
globalThis.IS_REACT_ACT_ENVIRONMENT = true
const { render, fireEvent, waitFor, cleanup, act } = await import('@testing-library/react')
const { createElement } = await import('react')
const require = createRequire(import.meta.url)
afterEach(cleanup)

// Render the actual pages with real React; replace only Firebase, styles and navigation.
function mount(page = 'SignupPage', failures = {}) {
  const calls = { create: [], profile: [], signOut: [], login: [], navigate: [] }
  const user = { uid: 'created-user' }
  const auth = {}
  const api = Object.fromEntries([
    ['createUserWithEmailAndPassword', 'create', { user }],
    ['updateProfile', 'profile'], ['signOut', 'signOut'], ['signInWithEmailAndPassword', 'login'],
  ].map(([method, step, result]) => [method, async (...args) => {
    calls[step].push(args)
    if (failures[step]) await failures[step]()
    return result
  }]))
  const source = readFileSync(new URL(`../src/pages/${page}.tsx`, import.meta.url), 'utf8')
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  const exports = {}
  new Function('exports', 'require', 'window', output)(exports, (id) => {
    if (id === 'firebase/auth') return api
    if (id === 'firebase/app') return { FirebaseError }
    if (id === '../lib/firebase') return { auth }
    if (id.endsWith('.css')) return {}
    if (id.includes('GoogleLoginButton')) return { __esModule: true, default: () => null }
    return require(id)
  }, { location: { assign: (path) => calls.navigate.push(path) } })
  const view = render(createElement(exports.default))
  const change = (label, value) => fireEvent.change(view.getByLabelText(label), { target: { value } })
  if (page === 'SignupPage') {
    change('이름', '테스트')
    change('비밀번호 확인', 'password123')
  }
  change('이메일', 'test@example.com')
  change('비밀번호', 'password123')
  const submit = () => fireEvent.submit(view.container.querySelector('form'))
  return { ...view, calls, user, auth, failures, change, submit }
}

test('normal signup saves the created user profile and signs out before navigating', async () => {
  const view = mount()
  view.submit()
  await waitFor(() => assert.deepEqual(view.calls.navigate, ['/login']))
  assert.deepEqual(view.calls.create, [[view.auth, 'test@example.com', 'password123']])
  assert.deepEqual(view.calls.profile, [[view.user, { displayName: '테스트' }]])
  assert.equal(view.calls.signOut.length, 1)
  assert.equal(view.getByRole('button').disabled, true)
  view.submit()
  assert.equal(view.calls.create.length, 1)
})

for (const [code, message] of [
  ['auth/email-already-in-use', '이미 가입된 이메일입니다.'],
  ['auth/network-request-failed', '네트워크 연결을 확인해주세요.'],
  ['auth/invalid-email', '올바르지 않은 이메일 형식입니다.'],
  ['auth/weak-password', '비밀번호는 8자 이상이어야 합니다.'],
  ['auth/operation-not-allowed', '이메일 회원가입을 사용할 수 없습니다. 관리자에게 문의해주세요.'],
  ['auth/too-many-requests', '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.'],
]) {
  test(`creation failure preserves ${code} message and allows creation retry`, async () => {
    const view = mount('SignupPage', { create: () => { throw new FirebaseError(code, '') } })
    view.submit()
    await waitFor(() => assert.equal(view.getByRole('alert').textContent, message))
    assert.equal(view.calls.profile.length, 0)
    assert.equal(view.calls.signOut.length, 0)
    assert.equal(view.getByLabelText('이메일').disabled, false)
    delete view.failures.create
    view.submit()
    await waitFor(() => assert.deepEqual(view.calls.navigate, ['/login']))
    assert.equal(view.calls.create.length, 2)
  })
}

test('profile failure retries only profile with corrected name, then retries only sign-out', async () => {
  const view = mount('SignupPage', {
    profile: () => { throw new Error('profile unavailable') },
    signOut: () => { throw new Error('sign-out unavailable') },
  })
  view.submit()
  await waitFor(() => assert.match(view.getByRole('alert').textContent, /계정 생성은 완료/))
  assert.equal(view.getByRole('button', { name: '이름 저장 다시 시도' }).disabled, false)
  assert.equal(view.getByLabelText('이름').disabled, false)
  assert.equal(view.getByLabelText('이메일').disabled, true)
  assert.equal(view.getByLabelText('비밀번호').value, '')
  assert.equal(view.calls.signOut.length, 0)
  view.submit()
  await waitFor(() => assert.equal(view.calls.profile.length, 2))
  await waitFor(() => assert.equal(view.getByRole('button').disabled, false))
  view.change('이름', ' ')
  view.submit()
  assert.ok(view.getByText('이름은 2자 이상 입력해주세요.'))
  assert.equal(view.calls.profile.length, 2)
  view.change('이름', '수정 이름')
  delete view.failures.profile
  view.submit()
  await waitFor(() => assert.match(view.getByRole('alert').textContent, /회원가입과 이름 저장은 완료/))
  assert.deepEqual(view.calls.profile[2], [view.user, { displayName: '수정 이름' }])
  assert.equal(view.getByLabelText('이름').disabled, true)
  assert.deepEqual(view.calls.navigate, [])
  view.submit()
  await waitFor(() => assert.equal(view.calls.signOut.length, 2))
  await waitFor(() => assert.equal(view.getByRole('button').disabled, false))
  delete view.failures.signOut
  fireEvent.click(view.getByRole('button', { name: '로그아웃 재시도 후 로그인 화면으로 이동' }))
  await waitFor(() => assert.deepEqual(view.calls.navigate, ['/login']))
  assert.equal(view.calls.create.length, 1)
  assert.equal(view.calls.profile.length, 3)
  assert.equal(view.calls.signOut.length, 3)
})

for (const step of ['create', 'profile', 'signOut']) {
  test(`duplicate submissions blocked while ${step} is pending`, async () => {
    let resolve
    const pending = new Promise((done) => { resolve = done })
    const view = mount('SignupPage', { [step]: () => pending })
    act(() => { view.submit(); view.submit() })
    await waitFor(() => assert.equal(view.calls[step].length, 1))
    assert.equal(view.getByRole('button').disabled, true)
    for (const input of view.container.querySelectorAll('input')) assert.equal(input.disabled, true)
    assert.equal(view.queryByRole('link', { name: '로그인' }), null)
    view.submit()
    assert.equal(view.calls[step].length, 1)
    assert.deepEqual(view.calls.navigate, [])
    await act(async () => resolve())
    await waitFor(() => assert.deepEqual(view.calls.navigate, ['/login']))
    assert.equal(view.calls.create.length, 1)
    assert.equal(view.calls.profile.length, 1)
    assert.equal(view.calls.signOut.length, 1)
  })
}

test('email login keeps credential errors and successful dashboard navigation', async () => {
  const view = mount('LoginPage', { login: () => { throw new FirebaseError('auth/invalid-credential', '') } })
  view.submit()
  await waitFor(() => assert.equal(view.getByRole('alert').textContent, '이메일 또는 비밀번호가 올바르지 않습니다.'))
  delete view.failures.login
  view.submit()
  await waitFor(() => assert.deepEqual(view.calls.navigate, ['/dashboard']))
  assert.equal(view.calls.create.length, 0)
})
