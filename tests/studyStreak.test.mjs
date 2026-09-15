import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import ts from 'typescript'

// Compile this pure TypeScript module in memory; no Firebase or browser needed.
const source = readFileSync(new URL('../src/lib/studyStreak.ts', import.meta.url), 'utf8')
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
const exports = {}
new Function('exports', output)(exports)
const { calculateStudyStreak } = exports
const at = (day, time = '12:00:00') => new Date(`${day}T${time}`)
const streak = (days, today) => calculateStudyStreak(days.map((day) => at(day)), today)

test('empty records and gaps produce zero', () => {
  assert.deepEqual(streak([], '2026-09-14'), { days: 0, studiedToday: false, hasRecords: false })
  assert.equal(streak(['2026-09-12'], '2026-09-14').days, 0)
})
test('today, duplicate days, unsorted records and yesterday grace', () => {
  assert.deepEqual(streak(['2026-09-12', '2026-09-14', '2026-09-13', '2026-09-14'], '2026-09-14'), { days: 3, studiedToday: true, hasRecords: true })
  assert.equal(streak(['2026-09-12', '2026-09-13'], '2026-09-14').days, 2)
  assert.equal(streak(['2026-09-11', '2026-09-13', '2026-09-14'], '2026-09-14').days, 2)
})
test('month, year and leap-day boundaries', () => {
  for (const [days, today] of [
    [['2026-08-31', '2026-09-01'], '2026-09-01'],
    [['2025-12-31', '2026-01-01'], '2026-01-01'],
    [['2024-02-28', '2024-02-29', '2024-03-01'], '2024-03-01'],
    [['2026-02-28', '2026-03-01'], '2026-03-01'],
  ]) assert.equal(streak(days, today).days, days.length)
})
test('local midnight deduplication and rollover', () => {
  const records = [at('2026-09-13', '23:59:59'), at('2026-09-14', '00:00:00'), at('2026-09-14', '23:59:59')]
  assert.equal(calculateStudyStreak(records, '2026-09-14').days, 2)
  assert.equal(calculateStudyStreak(records, '2026-09-15').days, 2)
  assert.equal(calculateStudyStreak(records, '2026-09-16').days, 0)
})
test('deleting the last record of a day breaks continuity', () => {
  assert.equal(streak(['2026-09-12', '2026-09-13', '2026-09-14'], '2026-09-14').days, 3)
  assert.equal(streak(['2026-09-12', '2026-09-14'], '2026-09-14').days, 1)
})
test('future and invalid timestamps do not extend streaks', () => {
  assert.deepEqual(calculateStudyStreak([at('2026-09-15'), new Date(NaN)], '2026-09-14'), { days: 0, studiedToday: false, hasRecords: false })
})
test('DST calendar boundaries still count consecutive days', () => {
  assert.equal(streak(['2026-03-07', '2026-03-08', '2026-03-09'], '2026-03-09').days, 3)
  assert.equal(streak(['2026-10-31', '2026-11-01', '2026-11-02'], '2026-11-02').days, 3)
})
