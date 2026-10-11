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

const input = { company: '기업', position: '개발자', url: '', status: 'interested', appliedAt: '', memo: '' }
const record = { ...input, id: 'one', userId: 'owner', createdAt: { toMillis: () => 1, toDate: () => new Date() }, updatedAt: { toDate: () => new Date() } }
function library(records = [], fail = false) {
  const calls = []
  const api = loader({ './firebase': { db: {} }, 'firebase/firestore': {
    collection: (_db, name) => name, doc: (...args) => args.length === 1 ? { id: 'new' } : args.slice(1).join('/'),
    query: (...args) => args, where: (...args) => args, documentId: () => '__name__', limit: n => ['limit', n],
    serverTimestamp: () => 'server', getDocsFromServer: async q => { calls.push(q); return { docs: records.map(item => ({ id: item.id, data: () => item })) } },
    setDoc: async (...args) => { calls.push(args); if (fail) throw new Error('network') },
    updateDoc: async (...args) => calls.push(args), deleteDoc: async (...args) => calls.push(args),
  } })('../src/lib/applications.ts')
  return { api, calls }
}
test('application validation rejects unsafe URLs, invalid dates, states and lengths', () => {
  const { api } = library()
  assert.equal(api.validateApplication({ ...input, company: ' 기업 ' }).company, '기업')
  for (const patch of [{ company: ' ' }, { position: 'x'.repeat(101) }, { url: 'javascript:alert(1)' }, { url: 'broken' }, { status: 'bad' }, { appliedAt: '2026-02-30' }, { appliedAt: '9999-01-01' }, { memo: 'x'.repeat(10001) }]) assert.throws(() => api.validateApplication({ ...input, ...patch }))
})
test('application CRUD preserves ownership fields and reconciles lost acknowledgement', async () => {
  const { api, calls } = library()
  await api.createApplication('one', 'owner', input)
  assert.deepEqual(calls[0][1], { ...input, userId: 'owner', createdAt: 'server', updatedAt: 'server' })
  await api.updateApplication('one', input)
  assert.equal(calls[1][1].userId, undefined)
  assert.equal(calls[1][1].createdAt, undefined)
  await api.changeApplicationStatus('one', 'accepted')
  assert.deepEqual(calls[2][1], { status: 'accepted', updatedAt: 'server' })
  await api.deleteApplication('one')
  assert.deepEqual(calls[3], ['applications/one'])
  await library([record], true).api.createApplication('one', 'owner', input)
  await assert.rejects(library([record], true).api.createApplication('one', 'owner', { ...input, company: '다른 기업' }), /이미 저장/)
})
test('owner queries, deterministic newest ordering and single-record lookup', async () => {
  const { api, calls } = library([record, { ...record, id: 'two', createdAt: { toMillis: () => 2 } }])
  assert.deepEqual((await api.fetchApplications('owner')).map(item => item.id), ['two', 'one'])
  assert.deepEqual(calls[0], ['applications', ['userId', '==', 'owner']])
  await api.fetchApplication('owner', 'one')
  assert.deepEqual(calls[1], ['applications', ['userId', '==', 'owner'], ['__name__', '==', 'one'], ['limit', 1]])
  assert.equal(await api.fetchApplication('owner', 'bad/id'), null)
})
function mount(url, overrides = {}) {
  window.history.replaceState({}, '', url)
  const calls = []
  const api = { ...library().api, fetchApplications: async () => [record], fetchApplication: async () => record,
    createApplication: async (...args) => calls.push(args), changeApplicationStatus: async (...args) => calls.push(args), deleteApplication: async (...args) => calls.push(args), ...overrides }
  const Page = loader({ '../hooks/useAuth': { useAuth: () => ({ user: { uid: 'owner' }, isLoading: false }) }, '../lib/applications': api,
    '../lib/todos': { localDate: () => '2026-10-10' }, '../hooks/useLogoutGuard': { useLogoutGuard: () => null }, './useLogoutGuard': { useLogoutGuard: () => null } })('../src/pages/JobPage.tsx').default
  return { view: render(createElement(Page)), calls }
}
test('job list filters states and displays empty filtered result', async () => {
  const { view } = mount('/job')
  await view.findByText('기업')
  fireEvent.change(view.getByLabelText('지원 상태 필터'), { target: { value: 'accepted' } })
  assert.ok(view.getByText('선택한 상태의 기록이 없습니다.'))
})
test('failed save retains input, retry reuses ID, and dirty forms protect unload', async () => {
  let fail = true
  const writes = []
  const { view } = mount('/job?new=1', { createApplication: async (...args) => { writes.push(args); if (fail) throw new Error('network') } })
  fireEvent.change(view.getByLabelText('기업명 *'), { target: { value: '기업' } })
  fireEvent.change(view.getByLabelText('포지션 *'), { target: { value: '개발자' } })
  const event = new window.Event('beforeunload', { cancelable: true })
  window.dispatchEvent(event)
  assert.equal(event.defaultPrevented, true)
  fireEvent.click(view.getByRole('button', { name: '지원 기록 저장' }))
  await view.findByText('network')
  assert.equal(view.getByLabelText('기업명 *').value, '기업')
  fail = false
  fireEvent.click(view.getByRole('button', { name: '지원 기록 저장' }))
  await view.findByText('지원 기록이 저장되었습니다.')
  assert.equal(writes.length, 2)
  assert.equal(writes[0][0], writes[1][0])
})
test('detail status change and confirmed deletion persist', async () => {
  const { view, calls } = mount('/job?application=one')
  await view.findByText('기업')
  fireEvent.change(view.getByLabelText('지원 상태'), { target: { value: 'accepted' } })
  await view.findByText('지원 상태가 저장되었습니다.')
  assert.deepEqual(calls[0], ['one', 'accepted'])
  fireEvent.click(view.getByRole('button', { name: '삭제하기' }))
  fireEvent.click(view.getByRole('button', { name: '삭제', exact: true }))
  await view.findByText('지원 기록이 삭제되었습니다.')
  assert.deepEqual(calls[1], ['one'])
})
