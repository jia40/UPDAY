import { createContext, useContext } from 'react'
import type { User } from 'firebase/auth'

export type AuthState = { user: User | null; isLoading: boolean; error: string | null; refreshProfile: (user: User) => void }
export const AuthContext = createContext<AuthState | null>(null)
export function useAuth() {
  const state = useContext(AuthContext)
  if (!state) throw new Error('useAuth는 AuthProvider 내부에서 사용해야 합니다.')
  return state
}
