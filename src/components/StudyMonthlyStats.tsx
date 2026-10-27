import { useMemo, useState } from 'react'
import type { StudySummary } from '../lib/studyLogs'
import { formatStudyTime, monthlyStudySummary, shiftStudyMonth } from '../lib/studyAnalytics'

export default function StudyMonthlyStats({ logs, today }: { logs: StudySummary[]; today: string }) {
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null)
  const currentMonth = today.slice(0, 7)
  const month = selectedMonth && selectedMonth < currentMonth ? selectedMonth : currentMonth
  const summary = useMemo(() => monthlyStudySummary(logs, month, today), [logs, month, today])
  return <section className="study-panel study-monthly" aria-labelledby="study-monthly-heading">
    <div className="study-heading-row">
      <h2 id="study-monthly-heading">월간 학습 통계</h2>
      <div className="study-weekly-nav" role="group" aria-label="통계 월 선택">
        <button type="button" disabled={month === '0001-01'} onClick={() => setSelectedMonth(shiftStudyMonth(month, -1))}>이전 달</button>
        <button type="button" disabled={month === currentMonth} onClick={() => setSelectedMonth(null)}>이번 달</button>
        <button type="button" disabled={month === currentMonth} onClick={() => {
          const next = shiftStudyMonth(month, 1)
          setSelectedMonth(next === currentMonth ? null : next)
        }}>다음 달</button>
      </div>
    </div>
    <p className="study-help" role="status">{summary.start} ~ {summary.end}</p>
    <p className="study-help">목록 필터와 관계없이 해당 월의 전체 기록을 집계합니다. 이번 달은 오늘까지 표시합니다.</p>
    <dl className="study-weekly-totals">
      <div><dt>총 학습 시간</dt><dd>{formatStudyTime(summary.minutes)}</dd></div>
      <div><dt>학습 기록</dt><dd>{summary.records}개</dd></div>
      <div><dt>학습한 날</dt><dd>{summary.studiedDays}일</dd></div>
    </dl>
    {summary.records === 0 && <p className="study-empty">이 달에는 학습 기록이 없어요.</p>}
  </section>
}
