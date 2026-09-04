import '../styles/dashboard.css'

function DashboardPage() {
  return (
    <main className="dashboard-page">
      <header className="dashboard-header">
        <a className="brand-logo" href="/dashboard" aria-label="Upday 대시보드">
          <span className="brand-logo__mark" aria-hidden="true" /> UPDAY
        </a>
      </header>
      <section className="dashboard-main" aria-labelledby="dashboard-heading">
        <p className="dashboard-main__eyebrow">TODAY</p>
        <h1 id="dashboard-heading">오늘도 한 걸음 성장해볼까요?</h1>
        <p>Upday 메인 페이지입니다.</p>
      </section>
    </main>
  )
}

export default DashboardPage
