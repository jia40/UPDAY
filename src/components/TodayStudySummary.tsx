import { useEffect, useState } from 'react'
import { fetchDailyStudyMinutes } from '../lib/todayStudy'
import { formatStudyTime } from '../lib/studyAnalytics'

export default function TodayStudySummary(props: { userId: string; date: string }) {
  return <DailySummary key={`${props.userId}:${props.date}`} {...props} />
}
function DailySummary({ userId, date }: { userId: string; date: string }) {
  const [minutes, setMinutes] = useState<number | null>(null)
  const [error, setError] = useState(false)
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let active = true
    let pending = false
    const refresh = async () => {
      if (!active || pending) return
      pending = true; setMinutes(null); setError(false)
      try { const value = await fetchDailyStudyMinutes(userId, date); if (active) setMinutes(value) }
      catch { if (active) setError(true) }
      finally { pending = false }
    }
    const visible = () => { if (document.visibilityState === 'visible') void refresh() }
    void refresh()
    window.addEventListener('focus', refresh); window.addEventListener('online', refresh); window.addEventListener('pageshow', refresh)
    document.addEventListener('visibilitychange', visible)
    return () => {
      active = false
      window.removeEventListener('focus', refresh); window.removeEventListener('online', refresh); window.removeEventListener('pageshow', refresh)
      document.removeEventListener('visibilitychange', visible)
    }
  }, [userId, date, retry])
  return <section className="today-panel today-study" aria-labelledby="today-study-heading">
    <div className="today-summary"><h2 id="today-study-heading">학습 시간</h2><span>{date}</span></div>
    {error ? <div role="alert"><p className="today-error">학습 시간을 불러오지 못했습니다. 연결 상태를 확인하고 다시 시도해주세요.</p><button type="button" onClick={() => setRetry(value => value + 1)}>학습 시간 다시 불러오기</button></div>
      : minutes === null ? <p role="status">학습 시간을 불러오고 있습니다.</p>
        : <p className="today-study-total">{formatStudyTime(minutes)}</p>}
  </section>
}
