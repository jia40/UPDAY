import { useEffect, useState } from 'react'
import { onAuthStateChanged, type User } from 'firebase/auth'
import { auth } from '../lib/firebase'

type AuthState = {
  user: User | null
  isLoading: boolean
  error: string | null
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    isLoading: true,
    error: null,
  })

  useEffect(() => {
    return onAuthStateChanged(
      auth,
      (user) => setState({ user, isLoading: false, error: null }),
      () => setState({
        user: null,
        isLoading: false,
        error: '로그인 상태를 확인하지 못했습니다. 새로고침 후 다시 시도해주세요.',
      }),
    )
  }, [])

  return state
}
