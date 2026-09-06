import MainLayout from './components/common/MainLayout'
import { mainPages } from './lib/navigation'
import ComingSoonPage from './pages/ComingSoonPage'
import DashboardPage from './pages/DashboardPage'
import LoginPage from './pages/LoginPage'
import SignupPage from './pages/SignupPage'

function App() {
  const pathname = window.location.pathname.replace(/\/+$/, '') || '/'
  if (pathname === '/signup') return <SignupPage />
  if (pathname === '/' || pathname === '/login') return <LoginPage />

  const page = mainPages.find(({ path }) => path === pathname)
  if (page || pathname === '/mypage') {
    return (
      <MainLayout pathname={pathname}>
        {pathname === '/dashboard' ? <DashboardPage /> : (
          <ComingSoonPage
            title={page?.label ?? '마이페이지'}
            description={page?.description ?? '내 계정 정보를 확인하는 공간입니다.'}
          />
        )}
      </MainLayout>
    )
  }

  return (
    <main className="auth-status">
      <h1>페이지를 찾을 수 없습니다.</h1>
      <a href="/dashboard">Dashboard로 이동</a>
    </main>
  )
}

export default App
