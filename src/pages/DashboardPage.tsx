import DashboardCareerCard from '../components/DashboardCareerCard'
import DashboardStudyCard from '../components/DashboardStudyCard'
import DashboardTodayCard from '../components/DashboardTodayCard'
import { useAuth } from '../hooks/useAuth'
import { useToday } from '../hooks/useToday'
import '../styles/dashboard.css'

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
        <p>오늘 할 일과 연속 학습일을 확인하고, 면접 질문을 복습해보세요.</p>
      </div>

      <div className="dashboard__grid">
        <DashboardTodayCard key={`${user?.uid}:${dateValue}`} userId={user?.uid} date={dateValue} />

        <DashboardStudyCard userId={user?.uid} date={dateValue} />

        <DashboardCareerCard kind="interview" userId={user?.uid} date={dateValue} />
        <DashboardCareerCard kind="job" userId={user?.uid} date={dateValue} />
      </div>
    </section>
  )
}

export default DashboardPage
