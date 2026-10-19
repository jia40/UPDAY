import { useEffect, useState } from 'react'
import { fetchInterviewStats, fetchJobStats, type JobStats } from '../lib/dashboardStats'

type Props = { kind: 'interview' | 'job'; userId?: string; date: string }
export default function DashboardCareerCard(props: Props) {
  return <CareerSummary key={`${props.kind}:${props.userId}:${props.date}`} {...props} />
}
function CareerSummary({ kind, userId, date }: Props) {
  const [summary, setSummary] = useState<number | JobStats | null>(null)
  const [error, setError] = useState(false)
  const [retry, setRetry] = useState(0)
  const interview = kind === 'interview'
  const title = interview ? '면접 준비' : '취업 지원'
  useEffect(() => {
    if (!userId) return
    let active = true
    let pending = false
    const refresh = async () => {
      if (!active || pending) return
      pending = true
      setSummary(null); setError(false)
      try {
        const result = await (kind === 'interview' ? fetchInterviewStats(userId, date) : fetchJobStats(userId))
        if (active) setSummary(result)
      } catch { if (active) setError(true) }
      finally { pending = false }
    }
    const visible = () => { if (document.visibilityState === 'visible') void refresh() }
    void refresh()
    window.addEventListener('focus', refresh)
    window.addEventListener('online', refresh)
    window.addEventListener('pageshow', refresh)
    document.addEventListener('visibilitychange', visible)
    return () => {
      active = false
      window.removeEventListener('focus', refresh); window.removeEventListener('online', refresh)
      window.removeEventListener('pageshow', refresh); document.removeEventListener('visibilitychange', visible)
    }
  }, [kind, userId, date, retry])
  const ready = summary !== null && !error
  const job = typeof summary === 'object' ? summary : null
  return <section className={`summary-card summary-card--${kind}`} aria-labelledby={`${kind}-heading`}>
    <div className="summary-card__heading"><div><p className="summary-card__label">{kind.toUpperCase()}</p><h2 id={`${kind}-heading`}>{title}</h2></div><span className="summary-card__symbol" aria-hidden="true">{interview ? '?' : '→'}</span></div>
    {interview ? <div className="summary-card__metric"><span>복습할 질문</span><strong>{ready ? `${summary}개` : '—'}</strong></div>
      : <dl className="summary-card__stats">{([['지원', 'applied'], ['서류', 'screening'], ['면접', 'interview']] as const).map(([label, key]) => <div key={key}><dt>{label}</dt><dd>{ready && job ? job[key] : '—'}</dd></div>)}</dl>}
    {error ? <div className="summary-card__description" role="alert"><p>{title} 집계를 불러오지 못했습니다. 연결 상태를 확인하고 다시 시도해주세요.</p><button className="summary-card__retry" onClick={() => setRetry(value => value + 1)}>다시 불러오기</button></div>
      : !ready ? <p className="summary-card__description" role="status">{title} 집계를 불러오고 있습니다.</p>
        : <><p className="summary-card__status">{interview ? (summary === 0 ? '복습할 질문이 없습니다' : '오늘의 면접 질문을 복습해보세요') : '현재 지원 현황'}</p><p className="summary-card__description">{interview ? '설명 가능 상태를 제외한 미복습·7일 이상 지난 질문입니다.' : '지원 수는 지원 완료 이후 상태의 합계입니다. 관심·지원 예정은 제외합니다.'}</p></>}
    <a className="summary-card__link" href={`/${kind}`}>{title} 보러가기 <span aria-hidden="true">→</span></a>
  </section>
}
