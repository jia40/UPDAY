import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useAuth } from '../../hooks/useAuth'

export default function GuestOnly({ children }: { children: ReactNode }) {
  const { user, isLoading, error } = useAuth()
  const [entry, setEntry] = useState<'guest' | 'signed-in' | 'error' | null>(null)
  const redirected = useRef(false)
  // Decide only on entry. Signup temporarily signs in to save its profile;
  // once admitted, its form must remain mounted through all retry stages.
  if (entry === null && !isLoading) setEntry(error ? 'error' : user ? 'signed-in' : 'guest')
  useEffect(() => {
    if (entry === 'signed-in' && !redirected.current) {
      redirected.current = true
      window.location.replace('/dashboard')
    }
  }, [entry])
  if (entry === 'error') return <main className="auth-status">
    <p role="alert">로그인 상태를 확인하지 못했습니다. 새로고침 후 다시 시도해주세요.</p>
    <button type="button" onClick={() => window.location.reload()}>다시 시도</button>
  </main>
  if (entry !== 'guest') return <main className="auth-status"><p role="status">로그인 상태를 확인하고 있습니다...</p></main>
  return children
}
