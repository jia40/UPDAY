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
const analytics = loader()('../src/lib/studyAnalytics.ts')
const entry = (studyDate, studyMinutes = 30) => ({ studyDate, studyMinutes, tags: [], createdAt: { toDate: () => new Date('2020-01-01T12:00:00') } })
test('monthly totals use study dates, sum duplicate days and stop at local today', () => {
  const summary = analytics.monthlyStudySummary([entry('2026-10-01', 60), entry('2026-10-01', 45), entry('2026-10-27', 15), entry('2026-10-28', 100), entry('2026-09-30'), entry('2026-11-01'), entry('invalid')], '2026-10', '2026-10-27')
  assert.deepEqual(summary, { start: '2026-10-01', end: '2026-10-27', minutes: 120, records: 3, studiedDays: 2 })
})
test('past months include leap day and month ends; empty months return zero', () => {
  assert.deepEqual(analytics.monthlyStudySummary([entry('2024-02-29'), entry('2024-03-01')], '2024-02', '2026-10-27'), { start: '2024-02-01', end: '2024-02-29', minutes: 30, records: 1, studiedDays: 1 })
  assert.equal(analytics.monthlyStudySummary([], '2025-02', '2026-10-27').end, '2025-02-28')
  assert.equal(analytics.monthlyStudySummary([], '2025-12', '2026-10-27').end, '2025-12-31')
  assert.equal(analytics.monthlyStudySummary([], '2026-04', '2026-10-27').end, '2026-04-30')
  assert.equal(analytics.monthlyStudySummary([], '2026-10', '2026-10-27').minutes, 0)
})
test('month shifting handles year and supported date boundaries and rejects invalid input', () => {
  assert.equal(analytics.shiftStudyMonth('2025-12', 1), '2026-01')
  assert.equal(analytics.shiftStudyMonth('2026-01', -1), '2025-12')
  assert.equal(analytics.shiftStudyMonth('0001-01', 1), '0001-02')
  assert.equal(analytics.monthlyStudySummary([], '9999-12', '9999-12-31').end, '9999-12-31')
  for (const month of ['2026-00', '2026-13', '0000-01', '2026-1']) assert.throws(() => analytics.shiftStudyMonth(month, 0))
  assert.throws(() => analytics.shiftStudyMonth('0001-01', -1))
  assert.throws(() => analytics.monthlyStudySummary([], '2026-11', '2026-10-27'))
})
test('monthly controls navigate independently and recompute after record updates or month rollover', async () => {
  const Monthly = loader()('../src/components/StudyMonthlyStats.tsx').default
  const logs = [entry('2026-10-01', 60), entry('2026-09-30', 45)]
  const view = render(createElement(Monthly, { logs, today: '2026-10-27' }))
  assert.ok(view.getByText('1시간'))
  assert.equal(view.getByRole('button', { name: '다음 달' }).disabled, true)
  fireEvent.click(view.getByRole('button', { name: '이전 달' }))
  assert.ok(view.getByText('45분'))
  assert.ok(view.getByText('2026-09-01 ~ 2026-09-30'))
  fireEvent.click(view.getByRole('button', { name: '이번 달' }))
  view.rerender(createElement(Monthly, { logs: [...logs, entry('2026-10-27', 30)], today: '2026-10-27' }))
  assert.ok(view.getByText('1시간 30분'))
  assert.ok(view.getByText('2개'))
  assert.ok(view.getByText('2일'))
  view.rerender(createElement(Monthly, { logs, today: '2026-11-01' }))
  assert.ok(view.getByText('2026-11-01 ~ 2026-11-01'))
  assert.ok(view.getByText('0분'))
  assert.ok(view.getByText('이 달에는 학습 기록이 없어요.'))
  fireEvent.click(view.getByRole('button', { name: '이전 달' }))
  fireEvent.click(view.getByRole('button', { name: '다음 달' }))
  assert.equal(view.getByRole('button', { name: '다음 달' }).disabled, true)
})
test('monthly summary updates after date edits and deletion', () => {
  const logs = [entry('2026-10-01'), entry('2026-10-02')]
  assert.equal(analytics.monthlyStudySummary(logs, '2026-10', '2026-10-27').records, 2)
  assert.equal(analytics.monthlyStudySummary([{ ...logs[0], studyDate: '2026-09-30' }, logs[1]], '2026-10', '2026-10-27').records, 1)
  assert.equal(analytics.monthlyStudySummary([], '2026-10', '2026-10-27').studiedDays, 0)
})
