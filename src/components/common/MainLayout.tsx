import { useEffect, type ReactNode } from 'react'
import { useAuth } from '../../hooks/useAuth'
import Header from './Header'

function MainLayout({ pathname, children }: { pathname: string; children: ReactNode }) {
  const { user, isLoading, error } = useAuth()

  useEffect(() => {
    if (!isLoading && !error && !user) window.location.replace('/login')
  }, [user, isLoading, error])

  if (error) {
    return (
      <main className="auth-status">
        <p role="alert">{error}</p>
        <button type="button" onClick={() => window.location.reload()}>다시 시도</button>
      </main>
    )
  }

  if (isLoading || !user) {
    return <main className="auth-status"><p role="status">로그인 상태를 확인하고 있습니다...</p></main>
  }

  return (
    <div className="main-layout">
      <a className="skip-link" href="#main-content">본문으로 건너뛰기</a>
      <Header pathname={pathname} />
      <main id="main-content" tabIndex={-1}>{children}</main>
    </div>
  )
}

export default MainLayout
