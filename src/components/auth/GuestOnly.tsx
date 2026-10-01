import { useEffect, useState, type ReactNode } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from '../../lib/firebase'

export default function GuestOnly({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<'loading' | 'guest' | 'error'>('loading')

  useEffect(() => {
    let settled = false
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (settled) return
      settled = true
      // Check entry only: signup temporarily signs in while saving the profile
      // and must retain its form, including profile/sign-out retry controls.
      if (user) window.location.replace('/dashboard')
      else setStatus('guest')
    }, () => {
      if (settled) return
      settled = true
      setStatus('error')
    })
    return () => { settled = true; unsubscribe() }
  }, [])

  if (status === 'error') {
    return <main className="auth-status">
      <p role="alert">로그인 상태를 확인하지 못했습니다. 새로고침 후 다시 시도해주세요.</p>
      <button type="button" onClick={() => window.location.reload()}>다시 시도</button>
    </main>
  }
  if (status === 'loading') {
    return <main className="auth-status"><p role="status">로그인 상태를 확인하고 있습니다...</p></main>
  }
  return children
}
