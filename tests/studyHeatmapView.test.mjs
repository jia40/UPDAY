import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import ts from 'typescript'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/study' })
globalThis.window = dom.window
globalThis.document = dom.window.document
globalThis.HTMLElement = dom.window.HTMLElement
globalThis.IS_REACT_ACT_ENVIRONMENT = true
const { render, fireEvent, waitFor, cleanup, act } = await import('@testing-library/react')
const { createElement } = await import('react')
const require = createRequire(import.meta.url)
afterEach(cleanup)

function mount({ records = ['2024-02-29', '2025-12-31'], fail = false, today = '2026-09-21' } = {}) {
  let date = today
  let requests = 0
  const logs = records.map((date, index) => ({ id: String(index), title: '기록 ' + date, tags: [], studyMinutes: 10, createdAt: { toDate: () => new Date(date + 'T12:00:00') } }))
  const cache = new Map()
  function load(path) {
    const url = new URL(path, import.meta.url)
    if (cache.has(url.href)) return cache.get(url.href)
    const source = readFileSync(url, 'utf8')
    const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText
    const exports = {}
    new Function('exports', 'require', output)(exports, (id) => {
      if (id.endsWith('.css')) return {}
      if (id.endsWith('/useAuth')) return { useAuth: () => ({ user: { uid: 'owner' }, isLoading: false }) }
      if (id.endsWith('/useToday')) return { useToday: () => date }
      if (id.endsWith('/studyLogs')) return { fetchStudyLogs: async (userId) => {
        assert.equal(userId, 'owner')
        requests++
        if (fail) throw new Error('조회 실패')
        return logs
      } }
      if (id.includes('Modal') || id.endsWith('/StudyRecordActions')) return { __esModule: true, default: () => null }
      if (id.startsWith('.')) return load(new URL(id + (['/StudyHeatmap', '/StudyWeeklyStats'].some((name) => id.endsWith(name)) ? '.tsx' : '.ts'), url).href)
      return require(id)
    })
    cache.set(url.href, exports)
    return exports
  }
  const Page = load('../src/pages/StudyPage.tsx').default
  const view = render(createElement(Page))
  return { ...view, requests: () => requests, changePeriod: (period) => fireEvent.change(view.getByLabelText('기간'), { target: { value: period } }),
    setToday: (next) => { date = next; view.rerender(createElement(Page)) } }
}

test('period changes reuse fetched logs and clear date filters without filtering the full list', async () => {
  const view = mount()
  await waitFor(() => assert.ok(view.getByLabelText('기간')))
  assert.equal(view.getByLabelText('기간').value, 'recent')
  assert.deepEqual([...view.getByLabelText('기간').options].map((option) => option.textContent), ['최근 1년', '올해', '이번 달', '2025년', '2024년'])
  const preview = view.container.querySelector('.study-heatmap__preview')
  const day = view.getByRole('button', { name: '2025-12-31 · 학습 기록 1개' })
  fireEvent.mouseEnter(day)
  act(() => day.focus())
  assert.equal(preview.textContent, '날짜를 선택하면 기록 개수를 확인할 수 있어요.')
  fireEvent.click(day)
  assert.equal(preview.textContent, '2025-12-31 · 학습 기록 1개')
  const otherDay = view.getByRole('button', { name: '2026-01-01 · 학습 기록 0개' })
  fireEvent.mouseEnter(otherDay)
  act(() => otherDay.focus())
  assert.equal(preview.textContent, '2025-12-31 · 학습 기록 1개')
  assert.equal(view.queryByRole('link', { name: /기록 2024/ }), null)
  view.changePeriod('2024')
  assert.ok(view.getByText('전체 학습 기록 2개'))
  assert.ok(view.getByRole('link', { name: /기록 2025/ }))
  assert.ok(view.getByText('2024년 · 기록 1개 · 2024-01-01 ~ 2024-12-31'))
  fireEvent.click(view.getByRole('button', { name: '2024-02-29 · 학습 기록 1개' }))
  assert.equal(view.queryByRole('link', { name: /기록 2025/ }), null)
  fireEvent.click(view.getByRole('button', { name: '필터 해제' }))
  assert.ok(view.getByRole('link', { name: /기록 2025/ }))
  view.changePeriod('current')
  assert.ok(view.getByText('선택한 기간에 학습 기록이 없어요.'))
  assert.ok(view.getByText('전체 학습 기록 2개'))
  assert.equal(view.requests(), 1)
})

test('period controls retain focus, reset calendar entry/scroll, and support keyboard navigation', async () => {
  const original = Object.getOwnPropertyDescriptor(dom.window.HTMLElement.prototype, 'scrollWidth')
  Object.defineProperty(dom.window.HTMLElement.prototype, 'scrollWidth', { configurable: true, get: () => 900 })
  try {
    const view = mount()
    await waitFor(() => assert.ok(view.getByLabelText('기간')))
    const select = view.getByLabelText('기간')
    act(() => select.focus())
    view.changePeriod('2024')
    assert.equal(document.activeElement, select)
    const entry = view.container.querySelector('.study-heatmap__day[tabindex="0"]')
    assert.equal(entry.getAttribute('aria-label'), '2024-12-31 · 학습 기록 0개')
    assert.equal(view.container.querySelector('.study-heatmap__scroll').scrollLeft, 900)
    act(() => entry.focus())
    fireEvent.keyDown(entry, { key: 'Home' })
    assert.equal(document.activeElement.getAttribute('aria-label'), '2024-01-01 · 학습 기록 0개')
    fireEvent.keyDown(document.activeElement, { key: 'ArrowRight' })
    assert.equal(document.activeElement.getAttribute('aria-label'), '2024-01-08 · 학습 기록 0개')
    fireEvent.click(document.activeElement)
    assert.equal(document.activeElement.getAttribute('aria-pressed'), 'true')
    assert.equal(view.container.querySelectorAll('.study-heatmap__blank button').length, 0)
    view.changePeriod('recent')
    assert.equal(view.container.querySelector('.study-heatmap__day[tabindex="0"]').getAttribute('aria-label'), '2026-09-21 · 학습 기록 0개')
  } finally {
    if (original) Object.defineProperty(dom.window.HTMLElement.prototype, 'scrollWidth', original)
    else delete dom.window.HTMLElement.prototype.scrollWidth
  }
})

test('current year follows midnight and new year without refetching, even with no records', async () => {
  const view = mount({ records: [], today: '2026-12-31' })
  await waitFor(() => assert.ok(view.getByLabelText('기간')))
  view.changePeriod('current')
  assert.equal(view.container.querySelectorAll('.study-heatmap__day').length, 365)
  view.setToday('2027-01-01')
  assert.equal(view.container.querySelectorAll('.study-heatmap__day').length, 1)
  assert.ok(view.getByText('올해 · 기록 0개 · 2027-01-01 ~ 2027-01-01'))
  view.setToday('2027-01-02')
  assert.equal(view.container.querySelectorAll('.study-heatmap__day').length, 2)
  assert.equal(view.requests(), 1)
})

test('fetch errors are shown as errors instead of an empty heatmap', async () => {
  const view = mount({ fail: true })
  await waitFor(() => assert.match(view.getByRole('alert').textContent, /조회 실패/))
  assert.equal(view.queryByLabelText('기간'), null)
  assert.equal(view.queryByText('선택한 기간에 학습 기록이 없어요.'), null)
  assert.equal(view.queryByText('전체 학습 기록 0개'), null)
})

test('this month clears date filters, shows its count and rolls into the next month without requests', async () => {
  const view = mount({ records: ['2026-08-31', '2026-09-01'], today: '2026-09-21' })
  await waitFor(() => assert.ok(view.getByLabelText('기간')))
  fireEvent.click(view.getByRole('button', { name: '2026-08-31 · 학습 기록 1개' }))
  view.changePeriod('month')
  assert.ok(view.getByText('이번 달 · 기록 1개 · 2026-09-01 ~ 2026-09-21'))
  assert.ok(view.getByText('전체 학습 기록 2개'))
  assert.equal(view.container.querySelectorAll('.study-heatmap__day').length, 21)
  assert.equal(view.queryByRole('button', { name: '필터 해제' }), null)
  view.setToday('2026-10-01')
  assert.ok(view.getByText('이번 달 · 기록 0개 · 2026-10-01 ~ 2026-10-01'))
  assert.equal(view.container.querySelectorAll('.study-heatmap__day').length, 1)
  assert.equal(view.requests(), 1)
})
