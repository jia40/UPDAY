import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import ts from 'typescript'

const source = readFileSync(new URL('../src/lib/studyHeatmap.ts', import.meta.url), 'utf8')
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
const exports = {}
new Function('exports', output)(exports)
const { createStudyHeatmap, studyDateKey, studyYears } = exports
const at = (date, time = '12:00:00') => new Date(date + 'T' + time)

test('this month includes only the first through today across leap days and month/year boundaries', () => {
  for (const today of ['2024-02-29', '2025-02-28', '2026-04-30', '2026-12-31', '2027-01-01']) {
    const first = today.slice(0, 8) + '01'
    const before = at(first)
    before.setDate(0)
    const after = at(today)
    after.setDate(after.getDate() + 1)
    const { days, weeks } = createStudyHeatmap([before, at(first, '00:00:00'), at(today, '23:59:59'), after], today, 'month')
    assert.equal(days.length, Number(today.slice(8)))
    assert.equal(days[0].date, first)
    assert.equal(days.at(-1).date, today)
    assert.equal(days.reduce((sum, day) => sum + day.count, 0), 2)
    assert.deepEqual(weeks.flat().filter(Boolean), days)
    assert.equal(weeks.flat().indexOf(days[0]), at(first).getDay())
  }
})

test('past years include complete leap and ordinary years with aligned blank cells', () => {
  for (const [year, length] of [[2024, 366], [2025, 365], [2000, 366], [1900, 365]]) {
    const { days, weeks } = createStudyHeatmap([], '2026-09-21', year)
    assert.equal(days.length, length)
    assert.equal(days[0].date, `${year}-01-01`)
    assert.equal(days.at(-1).date, `${year}-12-31`)
    assert.equal(new Set(days.map((day) => day.date)).size, length)
    assert.deepEqual(weeks.flat().filter(Boolean), days)
    assert.ok(weeks.every((week) => week.length === 7))
    for (const week of weeks) week.forEach((day, weekday) => {
      if (day) assert.equal(at(day.date).getDay(), weekday)
    })
  }
})

test('current year stops today and rolls over at local new year', () => {
  for (const [today, length] of [['2024-02-29', 60], ['2025-12-31', 365], ['2026-01-01', 1], ['2026-01-02', 2]]) {
    const { days } = createStudyHeatmap([], today, 'current')
    assert.equal(days.length, length)
    assert.equal(days[0].date, today.slice(0, 4) + '-01-01')
    assert.equal(days.at(-1).date, today)
  }
  assert.equal(createStudyHeatmap([], '2026-01-01', 2026).days.length, 1)
  for (const year of [2027, 2024.5, NaN, 0]) assert.throws(() => createStudyHeatmap([], '2026-01-01', year))
})

test('year options are unique descending local past years and exclude invalid/future dates', () => {
  const dates = [at('2024-12-31', '23:59:59'), at('2025-01-01', '00:00:00'), at('2024-02-29'), at('2026-01-01'), at('2027-01-01'), new Date(NaN)]
  assert.deepEqual(studyYears(dates, '2026-09-21'), [2025, 2024])
  assert.deepEqual(studyYears(dates, '2027-01-01'), [2026, 2025, 2024])
  assert.deepEqual(studyYears([], '2026-09-21'), [])
  const instant = new Date('2025-12-31T23:30:00Z')
  assert.deepEqual(studyYears([instant], '2027-01-01'), [instant.getFullYear()])
})

test('selected year counts only its endpoints and days, preserving intensity and empty state', () => {
  const records = [at('2023-12-31'), at('2024-01-01', '00:00:00'), ...Array(5).fill(at('2024-02-29')), at('2024-12-31', '23:59:59'), at('2025-01-01')]
  const { days } = createStudyHeatmap(records, '2026-09-21', 2024)
  assert.equal(days.reduce((sum, day) => sum + day.count, 0), 7)
  assert.equal(days[0].count, 1)
  assert.equal(days.at(-1).count, 1)
  assert.equal(days.find((day) => day.date === '2024-02-29').level, 4)
  assert.ok(createStudyHeatmap(records, '2026-09-21', 'current').days.every((day) => day.count === 0))
})

test('365 inclusive local dates across year, month and leap boundaries', () => {
  for (const [today, first] of [['2026-01-01', '2025-01-02'], ['2024-03-01', '2023-03-03'], ['2025-03-01', '2024-03-02'], ['2024-02-29', '2023-03-02']]) {
    const { days } = createStudyHeatmap([], today)
    assert.equal(days.length, 365)
    assert.equal(days[0].date, first)
    assert.equal(days.at(-1).date, today)
    assert.equal(new Set(days.map((day) => day.date)).size, 365)
    for (let index = 1; index < days.length; index++) {
      const expected = at(days[index - 1].date)
      expected.setDate(expected.getDate() + 1)
      assert.equal(days[index].date, studyDateKey(expected))
    }
  }
})

test('all possible starting weekdays have null padding and exactly 365 real cells', () => {
  for (let date = 1; date <= 7; date++) {
    const today = '2026-09-0' + date
    const { weeks, days } = createStudyHeatmap([], today)
    assert.equal(weeks.length, 53)
    assert.ok(weeks.every((week) => week.length === 7))
    assert.deepEqual(weeks.flat().filter(Boolean), days)
    assert.equal(weeks.flat().indexOf(days[0]), at(days[0].date).getDay())
    for (const week of weeks) week.forEach((day, weekday) => {
      if (day) assert.equal(at(day.date).getDay(), weekday)
    })
  }
})

test('counts duplicates, maps all five levels, ignores outside range and invalid dates', () => {
  const records = [at('2025-09-16'), at('2026-09-17'), new Date(NaN)]
  for (let count = 1; count <= 5; count++) {
    for (let index = 0; index < count; index++) records.push(at('2026-09-1' + count))
  }
  const { days } = createStudyHeatmap(records.reverse(), '2026-09-16')
  assert.equal(days.reduce((sum, day) => sum + day.count, 0), 15)
  for (let count = 1; count <= 5; count++) {
    const day = days.find((day) => day.date === '2026-09-1' + count)
    assert.equal(day.count, count)
    assert.equal(day.level, Math.min(count, 4))
  }
  assert.equal(days.at(-1).level, 0)
})

test('local midnight separates records; exact range endpoints are included', () => {
  const { days } = createStudyHeatmap([at('2025-09-17', '00:00:00'), at('2026-09-15', '23:59:59'), at('2026-09-16', '00:00:00'), at('2026-09-16', '23:59:59')], '2026-09-16')
  assert.equal(days[0].count, 1)
  assert.equal(days.at(-2).count, 1)
  assert.equal(days.at(-1).count, 2)
})

test('absolute timestamps use local date rather than their UTC date', () => {
  const instant = new Date('2026-09-16T00:30:00Z')
  const expected = instant.getFullYear() + '-' + String(instant.getMonth() + 1).padStart(2, '0') + '-' + String(instant.getDate()).padStart(2, '0')
  assert.equal(studyDateKey(instant), expected)
  assert.equal(createStudyHeatmap([instant], expected).days.at(-1).count, 1)
})

test('midnight rollover, additions and deletion update counts without mutating inputs', () => {
  const date = at('2026-09-16')
  const original = date.getTime()
  assert.equal(createStudyHeatmap([date, date], '2026-09-16').days.at(-1).count, 2)
  assert.equal(createStudyHeatmap([date], '2026-09-16').days.at(-1).count, 1)
  const next = createStudyHeatmap([date], '2026-09-17').days
  assert.equal(next.at(-1).count, 0)
  assert.equal(next.at(-2).count, 1)
  assert.equal(date.getTime(), original)
})

test('invalid current dates are rejected; empty dates stay zero', () => {
  for (const today of ['bad', '2026-02-30', '2026-2-01']) assert.throws(() => createStudyHeatmap([], today))
  assert.equal(studyDateKey(new Date(NaN)), null)
  assert.ok(createStudyHeatmap([], '2026-09-16').days.every((day) => day.count === 0 && day.level === 0))
})
