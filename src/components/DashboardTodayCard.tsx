import { useEffect, useState } from 'react'
import { fetchTodos } from '../lib/todos'

type Summary = { completed: number; total: number }

export default function DashboardTodayCard({ userId, date }: { userId?: string; date: string }) {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [error, setError] = useState(false)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    if (!userId) return
    let active = true
    let requestId = 0
    const refresh = async () => {
      const current = ++requestId
      try {
        const todos = await fetchTodos(userId, date)
        if (!active || current !== requestId) return
        setSummary({ completed: todos.filter((todo) => todo.completed).length, total: todos.length })
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
  const percent = summary?.total ? Math.round(summary.completed / summary.total * 100) : 0
  return (
    <section className="summary-card summary-card--today" aria-labelledby="today-heading">
      <div className="summary-card__heading">
        <div><p className="summary-card__label">TODAY</p><h2 id="today-heading">오늘 할 일</h2></div>
        <span className="summary-card__symbol" aria-hidden="true">✓</span>
      </div>
      <div className="summary-card__metric">
        <span>완료 / 전체 할 일</span>
        <strong>{ready ? `${summary.completed} / ${summary.total}` : '— / —'}</strong>
      </div>
      <div className="summary-card__progress-label">
        <span>오늘의 진행률</span><span>{ready ? `${percent}%` : error ? '조회 실패' : '불러오는 중'}</span>
      </div>
      {ready && <progress className="summary-card__progress" max={100} value={percent} aria-label="오늘의 할 일 진행률" />}
      {error ? (
        <div className="summary-card__description" role="alert">
          <p>오늘 할 일을 불러오지 못했습니다. 연결 상태를 확인하고 다시 시도해주세요.</p>
          <button className="summary-card__retry" type="button" onClick={() => {
            setSummary(null)
            setError(false)
            setRetry((value) => value + 1)
          }}>다시 불러오기</button>
        </div>
      ) : !ready ? (
        <p className="summary-card__description" role="status">오늘의 할 일을 불러오고 있습니다.</p>
      ) : (
        <p className="summary-card__description">
          {summary.total === 0 ? '아직 오늘 할 일이 없어요. 작은 목표 하나를 추가해보세요.'
            : summary.completed === summary.total ? '오늘의 할 일을 모두 완료했어요. 수고하셨습니다!'
              : `오늘 ${summary.total - summary.completed}개의 할 일이 남아 있어요. 하나씩 완료해보세요.`}
        </p>
      )}
      <a className="summary-card__link" href="/today">오늘 할 일 보러가기 <span aria-hidden="true">→</span></a>
    </section>
  )
}
