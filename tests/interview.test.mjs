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
    const scopedWindow = { location: { get search() { return window.location.search }, assign: navigate }, addEventListener: window.addEventListener.bind(window), removeEventListener: window.removeEventListener.bind(window) }
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
const record = (id, answer = '', time = 1) => ({ id, userId: 'owner', question: `질문 ${id}`, answer, tags: ['React'], status: 'unknown', lastReviewedAt: null, createdAt: { toMillis: () => time, toDate: () => new Date('2026-09-28T12:00:00') } })
function library({ records = [], writeError, readError } = {}) {
  const calls = { reads: [], writes: [] }
  const api = loader({ './firebase': { db: {} }, 'firebase/firestore': {
    collection: (_db, name) => name, doc: (...args) => args.length === 1 ? { id: 'new-id' } : args.slice(1).join('/'),
    documentId: () => '__name__', where: (...args) => args, limit: value => ['limit', value], query: (...args) => args,
    serverTimestamp: () => 'server-time',
    setDoc: async (...args) => { calls.writes.push(args); if (writeError) throw writeError },
    updateDoc: async (...args) => { calls.writes.push(args); if (writeError) throw writeError },
    deleteDoc: async (...args) => { calls.writes.push(args); if (writeError) throw writeError },
    getDocsFromServer: async q => { calls.reads.push(q); if (readError) throw readError; return { docs: records.map(item => ({ id: item.id, data: () => item })) } },
  } })('../src/lib/interviewQuestions.ts')
  return { api, calls }
}
const { api: validation } = library()

test('validation trims optional answer and normalizes/deduplicates tags', () => {
  assert.deepEqual(validation.validateInterview({ question: ' 질문 \n', answer: '  ', tags: ' React, ,CS,React, ' }), { question: '질문', answer: '', tags: ['React', 'CS'] })
  assert.equal(validation.validateInterview({ question: 'a'.repeat(300), answer: 'b'.repeat(10000), tags: Array.from({ length: 10 }, (_, i) => `${i}`.padEnd(30, 'x')).join(',') }).tags.length, 10)
})
for (const input of [
  { question: ' \n ' }, { question: 'x'.repeat(301) }, { answer: 'x'.repeat(10001) },
  { tags: 'x'.repeat(31) }, { tags: Array.from({ length: 11 }, (_, i) => String(i)).join(',') },
]) test(`validation rejects out-of-range input ${Object.keys(input)[0]} ${Object.values(input)[0].length}`, () => {
  assert.throws(() => validation.validateInterview({ question: '질문', answer: '', tags: '', ...input }))
})
test('creation stores owner/default review state/server timestamp and fails validation before write', async () => {
  const { api, calls } = library()
  await api.createInterviewQuestion('id', 'owner', { question: ' 질문 ', answer: '', tags: 'React,React' })
  assert.deepEqual(calls.writes[0], ['interviewQuestions/id', { question: '질문', answer: '', tags: ['React'], userId: 'owner', status: 'unknown', lastReviewedAt: null, createdAt: 'server-time' }])
  await assert.rejects(api.createInterviewQuestion('id', 'owner', { question: '', answer: '', tags: '' }))
  assert.equal(calls.writes.length, 1)
})
test('list uses owner query and latest-first ordering; detail uses owner/id and limit', async () => {
  const { api, calls } = library({ records: [record('old', '', 1), record('new', '', 2)] })
  assert.deepEqual((await api.fetchInterviewQuestions('owner')).map(x => x.id), ['new', 'old'])
  assert.deepEqual(calls.reads[0], ['interviewQuestions', ['userId', '==', 'owner']])
  await api.fetchInterviewQuestion('owner', 'old')
  assert.deepEqual(calls.reads[1], ['interviewQuestions', ['userId', '==', 'owner'], ['__name__', '==', 'old'], ['limit', 1]])
  assert.equal(await api.fetchInterviewQuestion('owner', 'bad/id'), null)
  assert.equal(calls.reads.length, 2)
  assert.equal(await library().api.fetchInterviewQuestion('owner', 'missing'), null)
})
test('lost write acknowledgement is reconciled without another document or overwrite', async () => {
  const saved = record('id')
  const { api, calls } = library({ records: [saved], writeError: new Error('network') })
  await api.createInterviewQuestion('id', 'owner', { question: saved.question, answer: '', tags: 'React' })
  assert.equal(calls.writes.length, 1)
  await assert.rejects(api.createInterviewQuestion('id', 'owner', { question: 'changed', answer: '', tags: '' }), /이미 저장/)
  await assert.rejects(library({ writeError: new Error('network'), readError: new Error('read') }).api.createInterviewQuestion('id', 'owner', { question: 'q', answer: '', tags: '' }), /network/)
})
function mount({ url = '/interview', records = [], detail = null, user = { uid: 'owner' }, loadError, save } = {}) {
  window.history.replaceState({}, '', url)
  const calls = { list: [], detail: [], save: [], navigate: [] }
  let auth = { user, isLoading: false }
  let failure = loadError
  const Page = loader({
    '../hooks/useAuth': { useAuth: () => auth },
    '../lib/interviewQuestions': {
      validateInterview: validation.validateInterview, newInterviewId: () => 'new-id',
      interviewStatuses: validation.interviewStatuses,
      updateInterviewQuestion: async (...args) => { calls.save.push(args); if (save) await save(...args) },
      deleteInterviewQuestion: async (...args) => { calls.save.push(['delete', ...args]); if (save) await save(...args) },
      updateInterviewStatus: async (...args) => { calls.save.push(['status', ...args]); if (save) await save(...args) },
      reviewInterviewQuestion: async (...args) => { calls.save.push(['review', ...args]); if (save) await save(...args) },
      fetchInterviewQuestions: async uid => { calls.list.push(uid); if (failure) throw failure; return records },
      fetchInterviewQuestion: async (...args) => { calls.detail.push(args); if (failure) throw failure; return detail },
      createInterviewQuestion: async (...args) => { calls.save.push(args); if (save) await save(...args) },
    },
  }, path => calls.navigate.push(path))('../src/pages/InterviewPage.tsx').default
  const view = render(createElement(Page))
  return { ...view, calls, recover: () => { failure = null }, setUser: value => { auth = { user: value, isLoading: false }; view.rerender(createElement(Page)) }, submit: () => fireEvent.submit(view.container.querySelector('form')) }
}
test('empty list guides first registration and signed-out page makes no requests', async () => {
  const view = mount()
  assert.ok(view.getByRole('status'))
  await waitFor(() => assert.ok(view.getByRole('link', { name: '첫 질문 등록하기' })))
  assert.deepEqual(view.calls.list, ['owner'])
  view.setUser(null)
  assert.ok(view.getByRole('link', { name: '로그인' }))
  assert.equal(view.calls.list.length, 1)
})
test('list links, multiline detail, optional answer, and missing question states', async () => {
  const view = mount({ records: [record('a', '답변')] })
  await waitFor(() => assert.ok(view.getByRole('link', { name: /질문 a/ })))
  assert.equal(view.getByRole('link', { name: /질문 a/ }).getAttribute('href'), '/interview?question=a')
  view.unmount()
  const detail = mount({ url: '/interview?question=a', detail: record('a') })
  await waitFor(() => assert.ok(detail.getByText('아직 작성한 답변이 없습니다.')))
  assert.deepEqual(detail.calls.detail, [['owner', 'a']])
  assert.equal(detail.calls.list.length, 0)
  assert.ok(detail.getByRole('link', { name: '← 목록으로' }))
  detail.unmount()
  const missing = mount({ url: '/interview?question=missing' })
  await waitFor(() => assert.ok(missing.getByText('면접 질문을 찾을 수 없습니다.')))
})
test('query errors allow retry and permission errors do not show records', async () => {
  const view = mount({ records: [record('a')], loadError: new FirebaseError('permission-denied', '') })
  await waitFor(() => assert.match(view.getByRole('alert').textContent, /권한/))
  assert.equal(view.queryByText('질문 a'), null)
  view.recover()
  fireEvent.click(view.getByRole('button', { name: '다시 불러오기' }))
  await waitFor(() => assert.ok(view.getByText('질문 a')))
})
test('form saves an unanswered question once, locks while pending, and links to created detail', async () => {
  let resolve
  const pending = new Promise(done => { resolve = done })
  const view = mount({ url: '/interview?new=1', save: () => pending })
  assert.equal(view.calls.list.length, 0)
  view.submit()
  assert.match(view.getByRole('alert').textContent, /1~300/)
  fireEvent.change(view.getByLabelText('질문 *'), { target: { value: '질문' } })
  act(() => { view.submit(); view.submit() })
  assert.equal(view.calls.save.length, 1)
  assert.equal(view.container.querySelector('fieldset').disabled, true)
  await act(async () => resolve())
  const dialog = view.getByRole('dialog')
  assert.match(dialog.textContent, /면접 질문이 저장/)
  fireEvent.click(view.getByRole('button', { name: '질문 보러가기' }))
  assert.deepEqual(view.calls.navigate, ['/interview?question=new-id'])
  view.submit()
  assert.equal(view.calls.save.length, 1)
})
test('save failure retains fields and retry reuses document id', async () => {
  let fail = true
  const view = mount({ url: '/interview?new=1', save: () => { if (fail) throw new Error('실패') } })
  fireEvent.change(view.getByLabelText('질문 *'), { target: { value: '질문' } })
  fireEvent.change(view.getByLabelText('답변 (선택)'), { target: { value: '답변\n내용' } })
  await act(async () => view.submit())
  assert.match(view.getByRole('alert').textContent, /실패/)
  assert.equal(view.getByLabelText('답변 (선택)').value, '답변\n내용')
  assert.equal(view.container.querySelector('fieldset').disabled, false)
  fail = false
  await act(async () => view.submit())
  assert.equal(view.calls.save.length, 2)
  assert.equal(view.calls.save[0][0], view.calls.save[1][0])
  assert.equal(view.calls.save[1][1], 'owner')
})
test('changing accounts resets form fields before saving under the new owner', async () => {
  const view = mount({ url: '/interview?new=1' })
  fireEvent.change(view.getByLabelText('질문 *'), { target: { value: 'private draft' } })
  view.setUser({ uid: 'other' })
  assert.equal(view.getByLabelText('질문 *').value, '')
})

test('edit, status and review only update mutable fields and validate before writing', async () => {
  const { api, calls } = library()
  api.updateInterviewQuestion('a', { question: ' q ', answer: ' answer ', tags: 'React,React' })
  api.updateInterviewStatus('a', 'learning')
  api.reviewInterviewQuestion('a')
  api.deleteInterviewQuestion('a')
  assert.deepEqual(calls.writes, [
    ['interviewQuestions/a', { question: 'q', answer: 'answer', tags: ['React'] }],
    ['interviewQuestions/a', { status: 'learning' }],
    ['interviewQuestions/a', { lastReviewedAt: 'server-time' }], ['interviewQuestions/a'],
  ])
  assert.throws(() => api.updateInterviewStatus('a', 'invalid'))
  assert.throws(() => api.updateInterviewQuestion('a', { question: '', answer: '', tags: '' }))
  assert.equal(calls.writes.length, 4)
})

test('edit loads existing fields, retains input after failure and retries the same question', async () => {
  let fail = true
  const view = mount({ url: '/interview?question=a&edit=1', detail: record('a'), save: async () => { if (fail) throw new Error('수정 실패') } })
  await view.findByText('면접 질문 수정')
  assert.equal(view.getByLabelText('질문 *').value, '질문 a')
  fireEvent.change(view.getByLabelText('답변 (선택)'), { target: { value: '추가 답변' } })
  await act(async () => view.submit())
  assert.match(view.getByRole('alert').textContent, /수정 실패/)
  assert.equal(view.getByLabelText('답변 (선택)').value, '추가 답변')
  fail = false
  await act(async () => view.submit())
  assert.equal(view.calls.save[1][0], 'a')
  fireEvent.click(view.getByRole('button', { name: '질문 보러가기' }))
  assert.deepEqual(view.calls.navigate, ['/interview?question=a'])
})

test('status failure keeps the saved selection; review refreshes server timestamp; deletion retries', async () => {
  let fail = true
  const detail = record('a')
  const view = mount({ url: '/interview?question=a', detail, save: async () => { if (fail) throw new Error('처리 실패'); detail.lastReviewedAt = { toDate: () => new Date('2026-10-08T12:00:00') } } })
  const select = await view.findByLabelText('이해 상태')
  await act(async () => fireEvent.change(select, { target: { value: 'learning' } }))
  assert.equal(select.value, 'unknown')
  fail = false
  await act(async () => fireEvent.change(select, { target: { value: 'explainable' } }))
  assert.equal(select.value, 'explainable')
  await act(async () => fireEvent.click(view.getByRole('button', { name: '복습 완료' })))
  assert.ok(view.getByText('복습이 기록되었습니다.'))
  assert.ok(view.getByText(/마지막 복습 · .*2026/))
  fireEvent.click(view.getByRole('button', { name: '삭제하기' }))
  fail = true
  await act(async () => fireEvent.click(view.getByRole('button', { name: '삭제', exact: true })))
  assert.ok(view.getByRole('dialog'))
  fail = false
  await act(async () => fireEvent.click(view.getByRole('button', { name: '삭제', exact: true })))
  fireEvent.click(view.getByRole('button', { name: '확인', exact: true }))
  assert.deepEqual(view.calls.navigate, ['/interview'])
})
