import { lazy, useEffect } from 'react'
import PageLoader from './components/common/PageLoader'
import GuestOnly from './components/auth/GuestOnly'
import MainLayout from './components/common/MainLayout'
import { mainPages } from './lib/navigation'
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'))
const ComingSoonPage = lazy(() => import('./pages/ComingSoonPage'))
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const LoginPage = lazy(() => import('./pages/LoginPage'))
const SignupPage = lazy(() => import('./pages/SignupPage'))
const TodayPage = lazy(() => import('./pages/TodayPage'))
const StudyPage = lazy(() => import('./pages/StudyPage'))
const InterviewPage = lazy(() => import('./pages/InterviewPage'))

function App() {
  const pathname = window.location.pathname.replace(/\/+$/, '') || '/'
  const page = mainPages.find(({ path }) => path === pathname)
  const title = pathname === '/' || pathname === '/login' ? '로그인'
    : pathname === '/signup' ? '회원가입' : pathname === '/reset-password' ? '비밀번호 재설정'
      : pathname === '/mypage' ? '마이페이지' : page?.label ?? '페이지를 찾을 수 없음'
  useEffect(() => { document.title = `Upday | ${title}` }, [title])
  if (pathname === '/reset-password') return <PageLoader><ResetPasswordPage /></PageLoader>
  if (pathname === '/signup') return <GuestOnly><PageLoader><SignupPage /></PageLoader></GuestOnly>
  if (pathname === '/' || pathname === '/login') return <GuestOnly><PageLoader><LoginPage /></PageLoader></GuestOnly>

  if (page || pathname === '/mypage') {
    return (
      <MainLayout pathname={pathname}>
        <PageLoader key={pathname}>
        {pathname === '/dashboard' ? <DashboardPage /> : pathname === '/today' ? <TodayPage /> : pathname === '/study' ? <StudyPage /> : pathname === '/interview' ? <InterviewPage /> : (
          <ComingSoonPage
            title={page?.label ?? '마이페이지'}
            description={page?.description ?? '내 계정 정보를 확인하는 공간입니다.'}
          />
        )}</PageLoader>
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
