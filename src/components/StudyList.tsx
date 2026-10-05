import { useMemo, useState } from 'react'
import StudyHeatmap from './StudyHeatmap'
import StudyWeeklyStats from './StudyWeeklyStats'
import StudyRecordList from './StudyRecordList'
import { useToday } from '../hooks/useToday'
import type { StudySummary } from '../lib/studyLogs'
import { filterStudyLogs, studyLogDate } from '../lib/studyAnalytics'
import { createStudyHeatmap, studyYears, type StudyPeriod } from '../lib/studyHeatmap'

type StudyListProps = {
  userId: string
  overview: StudySummary[]
  revision: number
  loading: boolean
  error: string
  reload: () => void
}

export default function StudyList({ userId, overview, revision, loading, error, reload }: StudyListProps) {
  const today = useToday()
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [selectedTag, setSelectedTag] = useState('')
  const [period, setPeriod] = useState<StudyPeriod>('recent')
  const dates = useMemo(() => overview.map(studyLogDate), [overview])
  const years = useMemo(() => studyYears(dates, today), [dates, today])
  const activePeriod = typeof period === 'number' && !years.includes(period) ? 'recent' : period
  const heatmap = useMemo(() => createStudyHeatmap(dates, today, activePeriod), [dates, today, activePeriod])
  const filterDate = selectedDate && selectedDate >= heatmap.days[0].date && selectedDate <= heatmap.days[heatmap.days.length - 1].date ? selectedDate : null
  const tags = useMemo(() => [...new Set(overview.flatMap((log) => log.tags))].sort((a, b) => a.localeCompare(b, 'ko')), [overview])
  const filterTag = tags.includes(selectedTag) ? selectedTag : ''
  const visibleLogs = filterStudyLogs(overview, filterDate, filterTag)
  const needsDateMigration = overview.some(log => !log.studyDate)

  if (loading) return <p role="status">학습 기록을 불러오고 있습니다.</p>
  if (error) return <div className="study-panel" role="alert"><p>{error}</p><button type="button" onClick={reload}>다시 불러오기</button></div>

  return <>
    <StudyHeatmap data={heatmap} selectedDate={filterDate} onSelect={setSelectedDate}
      period={activePeriod} years={years} onPeriodChange={(value) => { setPeriod(value); setSelectedDate(null) }} />
    <StudyWeeklyStats logs={overview} today={today} />
    <section className="study-panel" aria-label="학습 기록 목록">
      <div className="study-filter">
        <div className="study-tag-filter"><label htmlFor="study-tag-filter">태그 필터</label><select id="study-tag-filter" value={filterTag} onChange={(e) => setSelectedTag(e.target.value)}><option value="">전체 태그</option>{tags.map((tag) => <option key={tag} value={tag}>{tag}</option>)}</select></div>
        <p role="status">{filterDate || filterTag ? [filterDate, filterTag, '학습 기록 ' + visibleLogs.length + '개'].filter(Boolean).join(' · ') : '전체 학습 기록 ' + overview.length + '개'}</p>
        {(filterDate || filterTag) && <button type="button" onClick={() => { setSelectedDate(null); setSelectedTag('') }}>필터 해제</button>}
      </div>
      {needsDateMigration
        ? <p role="alert">이전 학습 기록을 불러올 수 없습니다. 관리자에게 문의해주세요.</p>
        : <StudyRecordList key={JSON.stringify([userId, filterDate, filterTag, revision])} userId={userId} date={filterDate} tag={filterTag} />}
    </section>

  </>
}
