export type StudyDay = { date: string; count: number; level: number }
export type StudyHeatmapData = { days: StudyDay[]; weeks: (StudyDay | null)[][] }

export function studyDateKey(date: Date): string | null {
  if (!Number.isFinite(date.getTime())) return null
  return [String(date.getFullYear()).padStart(4, '0'), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-')
}

export function createStudyHeatmap(createdDates: readonly Date[], today: string): StudyHeatmapData {
  // Local noon and calendar arithmetic keep both UTC offsets and DST out of day boundaries.
  const end = new Date(today + 'T12:00:00')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today) || studyDateKey(end) !== today) throw new Error('Invalid current date')
  const cursor = new Date(end)
  cursor.setDate(cursor.getDate() - 364)
  const firstWeekday = cursor.getDay()
  const counts = new Map<string, number>()
  for (const date of createdDates) {
    const key = studyDateKey(date)
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const days: StudyDay[] = []
  for (let index = 0; index < 365; index += 1) {
    const date = studyDateKey(cursor)!
    const count = counts.get(date) ?? 0
    days.push({ date, count, level: Math.min(count, 4) })
    cursor.setDate(cursor.getDate() + 1)
  }
  const cells: (StudyDay | null)[] = [...Array<null>(firstWeekday).fill(null), ...days]
  while (cells.length % 7) cells.push(null)
  const weeks = Array.from({ length: cells.length / 7 }, (_, index) => cells.slice(index * 7, index * 7 + 7))
  return { days, weeks }
}
