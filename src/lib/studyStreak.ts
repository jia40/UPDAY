export type StudyStreak = { days: number; studiedToday: boolean; hasRecords: boolean }

// Compare local calendar dates as day numbers so DST does not change day distances.
function calendarDay(date: Date) {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000
}

export function calculateStudyStreak(createdDates: readonly Date[], today: string): StudyStreak {
  const current = calendarDay(new Date(today + 'T12:00:00'))
  if (!Number.isFinite(current)) throw new Error('Invalid current date')
  const dates = new Set(createdDates.filter((date) => Number.isFinite(date.getTime())).map(calendarDay).filter((day) => day <= current))
  const studiedToday = dates.has(current)
  let cursor = studiedToday ? current : current - 1
  let days = 0
  while (dates.has(cursor)) {
    days += 1
    cursor -= 1
  }
  return { days, studiedToday, hasRecords: dates.size > 0 }
}
