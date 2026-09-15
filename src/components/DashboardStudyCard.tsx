import { useEffect, useState } from 'react'
import { fetchStudyLogs } from '../lib/studyLogs'
import { calculateStudyStreak, type StudyStreak } from '../lib/studyStreak'

// Remount on account/date changes, preventing the previous summary from appearing.
export default function DashboardStudyCard({ userId, date }: { userId?: string; date: string }) {
  return <StudySummary key={`${userId}:${date}`} userId={userId} date={date} />
}

function StudySummary({ userId, date }: { userId?: string; date: string }) {
  const [summary, setSummary] = useState<StudyStreak | null>(null)
  const [error, setError] = useState(false)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    if (!userId) return
    let active = true
    let requestId = 0
    const refresh = async () => {
      const current = ++requestId
      try {
        const logs = await fetchStudyLogs(userId)
        if (!active || current !== requestId) return
        setSummary(calculateStudyStreak(logs.map((log) => log.createdAt.toDate()), date))
        setError(false)
      } catch {
        if (active && current === requestId) setError(true)
      }
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    void refresh()
    window.addEventListener('focus', refresh)
    window.addEventListener('online', refresh)
    window.addEventListener('pageshow', refresh)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      active = false
      window.removeEventListener('focus', refresh)
      window.removeEventListener('online', refresh)
      window.removeEventListener('pageshow', refresh)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [userId, date, retry])

  const ready = summary !== null && !error
  return (
    <section className="summary-card summary-card--study" aria-labelledby="study-heading">
      <div className="summary-card__heading">
        <div><p className="summary-card__label">STUDY</p><h2 id="study-heading">학습 기록</h2></div>
        <span className="summary-card__symbol" aria-hidden="true">↗</span>
      </div>
      <div className="summary-card__metric"><span>연속 학습일</span><strong>{ready ? `${summary.days}일` : '—'}</strong></div>
      {error ? (
        <div className="summary-card__description" role="alert">
          <p>학습 기록을 불러오지 못했습니다. 연결 상태를 확인하고 다시 시도해주세요.</p>
          <button className="summary-card__retry" type="button" onClick={() => { setSummary(null); setError(false); setRetry((value) => value + 1) }}>다시 불러오기</button>
        </div>
      ) : !ready ? (
        <p className="summary-card__description" role="status">학습 기록을 불러오고 있습니다.</p>
      ) : (
        <>
          <p className="summary-card__status">{summary.studiedToday ? '오늘의 학습을 기록했어요' : '오늘의 학습을 기록해보세요'}</p>
          <p className="summary-card__description">{!summary.hasRecords ? '아직 학습 기록이 없어요. 첫 배움을 남겨보세요.'
            : summary.studiedToday ? `${summary.days}일째 배움을 이어가고 있어요.`
              : summary.days > 0 ? `어제까지 ${summary.days}일 연속 학습했어요. 오늘도 이어가볼까요?`
                : '오늘부터 다시 배움을 이어가보세요.'}</p>
        </>
      )}
      <a className="summary-card__link" href="/study">{ready && !summary.hasRecords ? '학습 기록 시작하기' : '학습 기록 보러가기'} <span aria-hidden="true">→</span></a>
    </section>
  )
}
