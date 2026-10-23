import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { onAuthStateChanged, type User } from 'firebase/auth'
import { auth } from '../../lib/firebase'
import { AuthContext } from '../../hooks/useAuth'

export default function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ user: User | null; isLoading: boolean; error: string | null }>({ user: null, isLoading: true, error: null })
  useEffect(() => {
    let active = true
    const unsubscribe = onAuthStateChanged(auth,
      user => { if (active) setState({ user, isLoading: false, error: null }) },
      () => { if (active) setState({ user: null, isLoading: false, error: '로그인 상태를 확인하지 못했습니다. 새로고침 후 다시 시도해주세요.' }) },
    )
    return () => { active = false; unsubscribe() }
  }, [])
  const refreshProfile = useCallback((user: User) => {
    setState(current => auth.currentUser === user && current.user === user ? { ...current } : current)
  }, [])
  return <AuthContext.Provider value={{ ...state, refreshProfile }}>{children}</AuthContext.Provider>
}
