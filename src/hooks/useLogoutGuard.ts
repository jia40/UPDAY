import { createContext, useContext } from 'react'

export type LogoutCheck = () => Promise<boolean>
type LogoutGuardState = {
  register: (guard: LogoutCheck) => () => void
  confirmLogout: () => Promise<boolean>
  loggingOut: boolean
  setLoggingOut: (value: boolean) => void
}
export const LogoutGuardContext = createContext<LogoutGuardState | null>(null)
export function useLogoutGuard() { return useContext(LogoutGuardContext) }
