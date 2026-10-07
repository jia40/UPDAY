import { useCallback, useRef, useState, type ReactNode } from 'react'
import { LogoutGuardContext, type LogoutCheck } from '../../hooks/useLogoutGuard'

export function LogoutGuardProvider({ children }: { children: ReactNode }) {
  const guard = useRef<LogoutCheck | null>(null)
  const [loggingOut, setLoggingOut] = useState(false)
  const register = useCallback((value: LogoutCheck) => {
    guard.current = value
    return () => { if (guard.current === value) guard.current = null }
  }, [])
  const confirmLogout = useCallback(async () => guard.current ? guard.current() : true, [])
  return <LogoutGuardContext.Provider value={{ register, confirmLogout, loggingOut, setLoggingOut }}>{children}</LogoutGuardContext.Provider>
}
