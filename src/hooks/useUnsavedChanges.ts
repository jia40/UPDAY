import { useEffect, useRef, useState } from 'react'
import { useLogoutGuard } from './useLogoutGuard'

export function useUnsavedChanges(protect: boolean, pending: boolean) {
  const guard = useLogoutGuard()
  const register = guard?.register
  const [destination, setDestination] = useState<string | null>(null)
  const [logout, setLogout] = useState(false)
  const decision = useRef<((value: boolean) => void) | null>(null)
  const allow = useRef(false)
  useEffect(() => { if (!guard?.loggingOut) allow.current = false }, [guard?.loggingOut])
  useEffect(() => {
    if (!register) return
    const unregister = register(async () => {
      if (pending) return false
      if (!protect) return true
      setLogout(true)
      return new Promise<boolean>(resolve => { decision.current = resolve })
    })
    return () => { unregister(); decision.current?.(false); decision.current = null }
  }, [register, protect, pending])
  useEffect(() => {
    if (!protect) return
    const unload = (event: BeforeUnloadEvent) => { if (!allow.current) { event.preventDefault(); event.returnValue = '' } }
    const click = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return
      const link = event.target instanceof Element ? event.target.closest('a[href]') : null
      if (!(link instanceof HTMLAnchorElement) || link.hasAttribute('download') || (link.target && link.target !== '_self')) return
      const url = new URL(link.href, window.location.href)
      if (url.origin !== window.location.origin || !['http:', 'https:'].includes(url.protocol)) return
      if (url.pathname === window.location.pathname && url.search === window.location.search && url.hash) return
      event.preventDefault(); event.stopPropagation()
      if (!pending && !guard?.loggingOut) setDestination(url.href)
    }
    const restore = () => { allow.current = false }
    window.addEventListener('beforeunload', unload)
    window.addEventListener('pageshow', restore)
    document.addEventListener('click', click, true)
    return () => { window.removeEventListener('beforeunload', unload); window.removeEventListener('pageshow', restore); document.removeEventListener('click', click, true) }
  }, [protect, pending, guard?.loggingOut])
  return {
    open: logout || destination !== null, blocked: pending || Boolean(guard?.loggingOut),
    leave: (url: string) => { if (pending || guard?.loggingOut) return; if (protect) setDestination(url); else window.location.assign(url) },
    cancel: () => { setDestination(null); setLogout(false); decision.current?.(false); decision.current = null },
    confirm: () => { if (pending) return; allow.current = true; if (logout) { setLogout(false); decision.current?.(true); decision.current = null } else if (destination) window.location.assign(destination) },
  }
}
