import { useRef, useState } from 'react'
import { signOut } from 'firebase/auth'
import { auth } from '../../lib/firebase'
import { mainPages, isPageActive } from '../../lib/navigation'
import '../../styles/header.css'

function Header({ pathname }: { pathname: string }) {
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [error, setError] = useState('')
  const logoutPending = useRef(false)

  const handleLogout = async () => {
    if (logoutPending.current) return
    logoutPending.current = true
    setIsLoggingOut(true)
    setError('')
    try {
      await signOut(auth)
      window.location.replace('/login')
    } catch {
      setError('로그아웃에 실패했습니다. 잠시 후 다시 시도해주세요.')
      logoutPending.current = false
      setIsLoggingOut(false)
    }
  }

  return (
    <header className="common-header">
      <div className="common-header__inner">
        <a className="brand-logo" href="/dashboard" aria-label="Upday 대시보드">
          <span className="brand-logo__mark" aria-hidden="true" /> UPDAY
        </a>
        <nav className="common-header__nav" aria-label="주요 메뉴">
          <ul>
            {mainPages.map(({ path, label }) => (
              <li key={path}>
                <a href={path} aria-current={isPageActive(pathname, path) ? 'page' : undefined}>
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="common-header__actions">
          <a className="common-header__profile" href="/mypage" aria-label="마이페이지"
            aria-current={isPageActive(pathname, '/mypage') ? 'page' : undefined}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21v-2a8 8 0 0 1 16 0v2" />
            </svg>
          </a>
          <button className="common-header__logout" type="button" onClick={handleLogout}
            disabled={isLoggingOut} aria-busy={isLoggingOut}>
            {isLoggingOut ? '로그아웃 중...' : '로그아웃'}
          </button>
        </div>
      </div>
      {error && <p className="common-header__error" role="alert">{error}</p>}
    </header>
  )
}

export default Header
