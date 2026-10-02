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

function mount({ edit = false, save = async () => {}, logs } = {}) {
  window.history.replaceState({}, '', edit ? '/study?record=one&edit=1' : '/study?new=1')
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
      location: { get search() { return window.location.search }, get href() { return window.location.href }, get origin() { return window.location.origin }, get pathname() { return window.location.pathname }, assign: url => navigation.push(url) },
      addEventListener: window.addEventListener.bind(window), removeEventListener: window.removeEventListener.bind(window),
    }
    new Function('exports', 'require', 'window', output)(exports, id => {
      if (id.endsWith('.css')) return {}
      if (id.endsWith('/useAuth')) return { useAuth: () => ({ user: { uid: 'owner' }, isLoading: false }) }
      if (id.endsWith('/useToday')) return { useToday: () => '2026-10-02' }
      if (id.endsWith('/studyLogs')) return { fetchStudyLogs: logs ?? (async () => edit ? [record] : []), validateStudy: () => {}, newStudyId: () => 'new', createStudyLog: save, updateStudyLog: save }
      if (id.endsWith('/StudyHeatmap') || id.endsWith('/StudyWeeklyStats')) return { __esModule: true, default: () => null }
      if (id.startsWith('.')) return load(new URL(id, url).href)
      return require(id)
    }, scopedWindow)
    cache.set(url.href, exports)
    return exports
  }
  const page = load('../src/pages/StudyPage.tsx')
  const view = render(createElement('div', null, createElement('a', { href: '/dashboard' }, '대시보드 메뉴'), createElement(page.default)))
  const change = (id, value) => fireEvent.change(view.container.querySelector(`#${id}`), { target: { value } })
  const unload = () => { const event = new window.Event('beforeunload', { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented }
  return { ...view, navigation, change, unload, ready: () => waitFor(() => assert.equal(view.container.querySelector('fieldset')?.disabled, false)) }
}

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
