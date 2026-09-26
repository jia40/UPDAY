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
const load = loader()
const analytics = load('../src/lib/studyAnalytics.ts')
const { effectiveStudyDate, studyLogDate, validateStudyDate, weeklyStudySummary, filterStudyLogs, studyWeekStart } = analytics
const { createStudyHeatmap } = load('../src/lib/studyHeatmap.ts')
const { calculateStudyStreak } = load('../src/lib/studyStreak.ts')
const record = (id, studyDate, studyMinutes = 30, tags = []) => ({ id, userId: 'owner', title: id, content: '학습 내용', tags, studyDate, studyMinutes, createdAt: { toDate: () => new Date('2026-09-23T12:00:00'), toMillis: () => 1 } })

test('study dates reject invalid calendar dates and future dates, including leap years', () => {
  for (const value of ['', '2026-2-01', '2026-02-29', '2024-02-30', '2026-04-31', '0000-01-01', '2026-13-01', '2026-09-24']) assert.throws(() => validateStudyDate(value, '2026-09-23'))
  for (const value of ['2024-02-29', '2026-09-23', '0001-01-01']) assert.equal(validateStudyDate(value, '2026-09-23'), value)
})

test('explicit study dates override timestamps while legacy dates retain local interpretation', () => {
  const legacy = record('legacy', undefined)
  const original = legacy.createdAt.toDate()
  const expected = `${original.getFullYear()}-${String(original.getMonth() + 1).padStart(2, '0')}-${String(original.getDate()).padStart(2, '0')}`
  assert.equal(effectiveStudyDate(legacy), expected)
  assert.equal(effectiveStudyDate(record('backdated', '2024-02-29')), '2024-02-29')
  assert.equal(effectiveStudyDate(record('invalid', '2026-02-30')), null)
})

test('weeks cross month/year/leap/DST boundaries and count each studied day once', () => {
  assert.equal(studyWeekStart('2027-01-03'), '2026-12-28')
  for (const [anchor, first, last] of [['2027-01-01', '2026-12-28', '2027-01-03'], ['2024-02-29', '2024-02-26', '2024-03-03'], ['2026-03-08', '2026-03-02', '2026-03-08']]) {
    const logs = [record('a', first, 40), record('b', first, 20), record('c', last, 50), record('outside', '2025-01-01', 99)]
    const summary = weeklyStudySummary(logs, anchor)
    assert.equal(summary.start, first)
    assert.equal(summary.end, last)
    assert.equal(summary.minutes, 110)
    assert.equal(summary.records, 3)
    assert.equal(summary.studiedDays, 2)
    assert.equal(summary.days[0].minutes, 60)
    assert.equal(summary.days[6].minutes, 50)
    assert.equal(summary.days[1].minutes, 0)
  }
  const empty = weeklyStudySummary([], '2026-09-23')
  assert.equal(empty.minutes + empty.records + empty.studiedDays, 0)
})

test('tag/date intersection, clearing, and date edits affect filters, heatmap, streak and totals', () => {
  const logs = [record('a', '2026-09-21', 20, ['React']), record('b', '2026-09-22', 30, ['React', 'CS']), record('c', '2026-09-22', 40, ['CS'])]
  assert.deepEqual(filterStudyLogs(logs, '2026-09-22', 'React').map(x => x.id), ['b'])
  assert.equal(filterStudyLogs(logs, null, '').length, 3)
  assert.equal(filterStudyLogs(logs, '2026-09-21', 'CS').length, 0)
  assert.equal(calculateStudyStreak(logs.map(studyLogDate), '2026-09-22').days, 2)
  const changed = logs.map(log => ({ ...log, studyDate: '2026-09-14' }))
  assert.equal(calculateStudyStreak(changed.map(studyLogDate), '2026-09-22').days, 0)
  assert.equal(createStudyHeatmap(changed.map(studyLogDate), '2026-09-22').days.find(x => x.date === '2026-09-14').count, 3)
  assert.equal(weeklyStudySummary(changed, '2026-09-22').records, 0)
  assert.equal(weeklyStudySummary(changed, '2026-09-14').minutes, 90)
})

function apiHarness() {
  const calls = []
  const api = loader({ './firebase': { db: {} }, 'firebase/firestore': {
    collection: (_db, name) => name, doc: (...args) => args.join('/'),
    serverTimestamp: () => 'server-time', setDoc: async (...args) => calls.push(['create', ...args]),
    updateDoc: async (...args) => calls.push(['update', ...args]),
  } })('../src/lib/studyLogs.ts')
  return { api, calls }
}

test('create stores studyDate; update preserves createdAt/userId and validates before writing', async () => {
  const { api, calls } = apiHarness()
  const input = { title: ' 제목 ', content: '내용', tags: 'React, React', studyMinutes: '30', studyDate: '2024-02-29' }
  await api.createStudyLog('a', 'owner', input)
  assert.equal(calls[0][2].studyDate, '2024-02-29')
  assert.equal(calls[0][2].createdAt, 'server-time')
  await api.updateStudyLog('a', { ...input, studyDate: '2024-03-01' })
  assert.equal(calls[1][2].studyDate, '2024-03-01')
  assert.equal('createdAt' in calls[1][2], false)
  assert.equal('userId' in calls[1][2], false)
  assert.throws(() => api.updateStudyLog('a', { ...input, studyDate: '9999-12-31' }))
  assert.equal(calls.length, 2)
})

function mount({ logs = [], url = '/study', fail = false } = {}) {
  window.history.replaceState({}, '', url)
  let today = '2026-09-23'
  const saved = []
  const { api } = apiHarness()
  const Page = loader({
    '../hooks/useAuth': { useAuth: () => ({ user: { uid: 'owner' } }) },
    '../hooks/useToday': { useToday: () => today },
    '../lib/studyLogs': {
      fetchStudyLogs: async () => { if (fail) throw new Error('조회 실패'); return logs },
      validateStudy: api.validateStudy, newStudyId: () => 'new-record',
      createStudyLog: async (...args) => saved.push(['create', ...args]),
      updateStudyLog: async (...args) => saved.push(['update', ...args]),
    },
    '../components/common/ConfirmModal': { __esModule: true, default: () => null },
    '../components/common/CompleteModal': { __esModule: true, default: () => null },
  })('../src/pages/StudyPage.tsx').default
  const view = render(createElement(Page))
  return { ...view, saved, setToday: (value) => { today = value; view.rerender(createElement(Page)) } }
}

test('tag and date filters compose without changing weekly totals; navigation crosses weeks', async () => {
  const view = mount({ logs: [record('React 공부', '2026-09-21', 30, ['React']), record('CS 공부', '2026-09-22', 60, ['CS']), record('지난 공부', '2026-09-14', 10, ['React'])] })
  await waitFor(() => assert.ok(view.getByLabelText('태그 필터')))
  const weekly = within(view.getByRole('region', { name: '주간 학습 통계' }))
  assert.ok(weekly.getByText('1시간 30분'))
  fireEvent.change(view.getByLabelText('태그 필터'), { target: { value: 'React' } })
  assert.equal(view.queryByRole('link', { name: /CS 공부/ }), null)
  fireEvent.click(view.getByRole('button', { name: '2026-09-22 · 학습 기록 1개' }))
  assert.ok(view.getByText(/선택한 조건에 맞는 학습 기록이 없어요/))
  assert.ok(weekly.getByText('1시간 30분'))
  fireEvent.click(view.getByRole('button', { name: '필터 해제' }))
  assert.ok(view.getByRole('link', { name: /CS 공부/ }))
  fireEvent.click(weekly.getByRole('button', { name: '이전 주' }))
  assert.match(weekly.getByRole('status').textContent, /2026-09-14 ~ 2026-09-20/)
  assert.ok(weekly.getByText('1개'))
  fireEvent.click(weekly.getByRole('button', { name: '이번 주' }))
  assert.equal(weekly.getByRole('button', { name: '다음 주' }).disabled, true)
  view.setToday('2026-09-28')
  assert.match(weekly.getByRole('status').textContent, /2026-09-28 ~ 2026-10-04/)
  assert.ok(weekly.getByText('이 주에는 학습 기록이 없어요.'))
})

test('new form defaults to today, rejects future dates, and submits selected studyDate', async () => {
  const view = mount({ url: '/study?new=1' })
  await waitFor(() => assert.equal(view.container.querySelector('fieldset').disabled, false))
  assert.equal(view.getByLabelText('학습 날짜 *').value, '2026-09-23')
  for (const [label, value] of [['제목 *', '테스트'], ['학습 내용 *', '내용'], ['분', '30'], ['학습 날짜 *', '9999-12-31']]) fireEvent.change(view.getByLabelText(label), { target: { value } })
  fireEvent.submit(view.container.querySelector('form'))
  assert.match(view.getByRole('alert').textContent, /오늘 또는 지난 날짜/)
  assert.equal(view.saved.length, 0)
  fireEvent.change(view.getByLabelText('학습 날짜 *'), { target: { value: '2024-02-29' } })
  await act(async () => fireEvent.submit(view.container.querySelector('form')))
  assert.equal(view.saved[0][3].studyDate, '2024-02-29')
})

test('legacy edit defaults to createdAt date and submits a changed studyDate', async () => {
  const view = mount({ logs: [record('legacy', undefined)], url: '/study?record=legacy&edit=1' })
  await waitFor(() => assert.ok(view.getByRole('button', { name: '수정 저장' })))
  assert.equal(view.getByLabelText('학습 날짜 *').value, '2026-09-23')
  fireEvent.change(view.getByLabelText('학습 날짜 *'), { target: { value: '2024-02-29' } })
  await act(async () => fireEvent.submit(view.container.querySelector('form')))
  assert.equal(view.saved[0][0], 'update')
  assert.equal(view.saved[0][2].studyDate, '2024-02-29')
})

test('dashboard streak uses explicit study dates instead of creation time', async () => {
  const logs = [record('a', '2026-09-21'), record('b', '2026-09-22')]
  const Card = loader({ '../lib/studyLogs': { fetchStudyLogs: async () => logs } })('../src/components/DashboardStudyCard.tsx').default
  const view = render(createElement(Card, { userId: 'owner', date: '2026-09-22' }))
  await waitFor(() => assert.ok(view.getByText('2일')))
  assert.ok(view.getByText('오늘의 학습을 기록했어요'))
})

test('failed record fetch does not display misleading zero weekly totals', async () => {
  const view = mount({ fail: true })
  await waitFor(() => assert.match(view.getByRole('alert').textContent, /조회 실패/))
  assert.equal(view.queryByRole('region', { name: '주간 학습 통계' }), null)
  assert.equal(view.queryByLabelText('태그 필터'), null)
})
