import DashboardTodayCard from '../components/DashboardTodayCard'
import { useAuth } from '../hooks/useAuth'
import { useToday } from '../hooks/useToday'
import '../styles/dashboard.css'

const cards = [
  { id: 'study', label: 'STUDY', title: '학습 기록', symbol: '↗', metric: '연속 학습일', description: '오늘 배운 것을 남기고, 나만의 학습 흐름을 만들어보세요.', action: '학습 기록 시작하기', path: '/study' },
  { id: 'interview', label: 'INTERVIEW', title: '면접 준비', symbol: '?', metric: '복습할 질문', description: '기억하고 싶은 질문과 답변을 모아 차근차근 준비해보세요.', action: '면접 준비 시작하기', path: '/interview' },
  { id: 'job', label: 'JOB', title: '취업 지원', symbol: '→', description: '관심 있는 기업부터 면접까지, 지원 과정을 한곳에 모아보세요.', action: '취업 지원 시작하기', path: '/job' },
]

function DashboardPage() {
  const { user } = useAuth()
  const name = user?.displayName?.trim()
  const dateValue = useToday()
  const today = new Date(dateValue + 'T12:00:00')
  const dateLabel = new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
  }).format(today)

  return (
    <section className="dashboard" aria-labelledby="dashboard-heading">
      <header className="dashboard__intro">
        <p className="dashboard-main__eyebrow">YOUR DAILY GROWTH</p>
        <time dateTime={dateValue}>{dateLabel}</time>
        <h1 id="dashboard-heading">{name ? `${name}님, 오늘도 한 걸음 성장해볼까요?` : '오늘도 한 걸음 성장해볼까요?'}</h1>
        <p>작은 기록이 쌓여 더 나은 내일을 만듭니다.</p>
      </header>

      <div className="dashboard__notice">
        <span aria-hidden="true">✦</span>
        <p>오늘 할 일의 진행 상황을 확인해보세요. 학습 기록, 면접 준비, 취업 지원 기능도 준비하고 있습니다.</p>
      </div>

      <div className="dashboard__grid">
        <DashboardTodayCard key={`${user?.uid}:${dateValue}`} userId={user?.uid} date={dateValue} />

        {cards.map((card) => (
          <section key={card.id} className={`summary-card summary-card--${card.id}`} aria-labelledby={`${card.id}-heading`}>
            <div className="summary-card__heading">
              <div><p className="summary-card__label">{card.label}</p><h2 id={`${card.id}-heading`}>{card.title}</h2></div>
              <span className="summary-card__symbol" aria-hidden="true">{card.symbol}</span>
            </div>
            {card.id === 'job' ? (
              <dl className="summary-card__stats">
                {['지원', '서류', '면접'].map((label) => <div key={label}><dt>{label}</dt><dd aria-label="집계 준비 중">—</dd></div>)}
              </dl>
            ) : (
              <div className="summary-card__metric"><span>{card.metric}</span><strong aria-label="집계 준비 중">—</strong></div>
            )}
            <p className="summary-card__status">기록 기능 준비 중</p>
            <p className="summary-card__description">{card.description}</p>
            <a className="summary-card__link" href={card.path}>{card.action} <span aria-hidden="true">→</span></a>
          </section>
        ))}
      </div>
    </section>
  )
}

export default DashboardPage
