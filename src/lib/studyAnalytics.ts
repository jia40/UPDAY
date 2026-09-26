import { studyDateKey } from './studyHeatmap'

type DatedStudy = { studyDate?: string; createdAt?: { toDate: () => Date } }
type StudyEntry = DatedStudy & { studyMinutes: number; tags: string[] }

export function parseStudyDate(value: string): Date {
  const date = new Date(value + 'T12:00:00')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '0001-01-01' || studyDateKey(date) !== value) {
    throw new Error('올바른 학습 날짜를 선택해주세요.')
  }
  return date
}

export function validateStudyDate(value: string, today = studyDateKey(new Date())!) {
  parseStudyDate(value)
  if (value > today) throw new Error('학습 날짜는 오늘 또는 지난 날짜로 선택해주세요.')
  return value
}

// Legacy records keep their original local-date interpretation until edited.
export function effectiveStudyDate(log: DatedStudy): string | null {
  if (log.studyDate !== undefined) {
    try { return studyDateKey(parseStudyDate(log.studyDate)) } catch { return null }
  }
  return studyDateKey(log.createdAt?.toDate() ?? new Date(NaN))
}

export function studyLogDate(log: DatedStudy): Date {
  const key = effectiveStudyDate(log)
  return key ? parseStudyDate(key) : new Date(NaN)
}

export function shiftStudyDate(value: string, days: number): string {
  const date = parseStudyDate(value)
  date.setDate(date.getDate() + days)
  return studyDateKey(date)!
}

export function studyWeekStart(value: string): string {
  const day = parseStudyDate(value).getDay()
  return shiftStudyDate(value, -((day + 6) % 7))
}

export function weeklyStudySummary(logs: readonly StudyEntry[], anchor: string) {
  const start = studyWeekStart(anchor)
  const days = Array.from({ length: 7 }, (_, index) => ({ date: shiftStudyDate(start, index), minutes: 0, records: 0 }))
  for (const log of logs) {
    const day = days.find((item) => item.date === effectiveStudyDate(log))
    if (day) { day.minutes += log.studyMinutes; day.records += 1 }
  }
  return {
    start, end: days[6].date, days,
    minutes: days.reduce((sum, day) => sum + day.minutes, 0),
    records: days.reduce((sum, day) => sum + day.records, 0),
    studiedDays: days.filter((day) => day.records > 0).length,
  }
}

export function filterStudyLogs<T extends StudyEntry>(logs: readonly T[], date: string | null, tag: string): T[] {
  return logs.filter((log) => (!date || effectiveStudyDate(log) === date) && (!tag || log.tags.includes(tag)))
}

export function formatStudyTime(total: number) {
  const hours = Math.floor(total / 60)
  const minutes = total % 60
  return [hours ? `${hours}시간` : '', minutes ? `${minutes}분` : ''].filter(Boolean).join(' ') || '0분'
}
