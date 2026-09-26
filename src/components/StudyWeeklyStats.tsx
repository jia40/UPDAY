import { useMemo, useState } from 'react'
import type { StudyLog } from '../lib/studyLogs'
import { formatStudyTime, shiftStudyDate, studyWeekStart, weeklyStudySummary } from '../lib/studyAnalytics'

const weekdays = ['월', '화', '수', '목', '금', '토', '일']

export default function StudyWeeklyStats({ logs, today }: { logs: StudyLog[]; today: string }) {
  const [selectedWeek, setSelectedWeek] = useState<string | null>(null)
  const currentWeek = studyWeekStart(today)
  const anchor = selectedWeek && selectedWeek < currentWeek ? selectedWeek : currentWeek
  const summary = useMemo(() => weeklyStudySummary(logs, anchor), [logs, anchor])
  const maximum = Math.max(1, ...summary.days.map((day) => day.minutes))
  return (
    <section className="study-panel study-weekly" aria-labelledby="study-weekly-heading">
      <div className="study-heading-row">
        <h2 id="study-weekly-heading">주간 학습 통계</h2>
        <div className="study-weekly-nav" aria-label="통계 주간 선택">
          <button type="button" disabled={summary.start < '0001-01-08'} onClick={() => setSelectedWeek(shiftStudyDate(summary.start, -7))}>이전 주</button>
          <button type="button" disabled={anchor === currentWeek} onClick={() => setSelectedWeek(null)}>이번 주</button>
          <button type="button" disabled={anchor === currentWeek} onClick={() => setSelectedWeek(shiftStudyDate(summary.start, 7))}>다음 주</button>
        </div>
      </div>
      <p className="study-help" role="status">{summary.start} ~ {summary.end} · 월요일~일요일</p>
      <p className="study-help">목록 필터와 관계없이 해당 주의 전체 기록을 집계합니다.</p>
      <dl className="study-weekly-totals">
        <div><dt>총 학습 시간</dt><dd>{formatStudyTime(summary.minutes)}</dd></div>
        <div><dt>학습 기록</dt><dd>{summary.records}개</dd></div>
        <div><dt>학습한 날</dt><dd>{summary.studiedDays}일</dd></div>
      </dl>
      <ul className="study-weekly-days" aria-label="요일별 학습 시간">
        {summary.days.map((day, index) => <li key={day.date}>
          <time dateTime={day.date}>{weekdays[index]} <span>{day.date.slice(5).replace('-', '/')}</span></time>
          <span className="study-weekly-bar" aria-hidden="true"><span style={{ width: `${day.minutes / maximum * 100}%` }} /></span>
          <span>{formatStudyTime(day.minutes)}</span>
        </li>)}
      </ul>
      {summary.records === 0 && <p className="study-empty">이 주에는 학습 기록이 없어요.</p>}
    </section>
  )
}
