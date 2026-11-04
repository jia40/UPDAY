import { useEffect } from 'react'

export function usePageRefresh(refresh: () => Promise<void>, enabled = true) {
  useEffect(() => {
    if (!enabled) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const schedule = () => {
      if (document.visibilityState !== 'visible' || timer !== undefined) return
      // Refresh immediately (sharing any in-flight read), then suppress the
      // accompanying focus/visibilitychange/pageshow events for the same return.
      void refresh()
      timer = setTimeout(() => { timer = undefined }, 100)
    }
    const restored = (event: PageTransitionEvent) => { if (event.persisted) schedule() }
    window.addEventListener('focus', schedule)
    document.addEventListener('visibilitychange', schedule)
    window.addEventListener('pageshow', restored)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('focus', schedule)
      document.removeEventListener('visibilitychange', schedule)
      window.removeEventListener('pageshow', restored)
    }
  }, [refresh, enabled])
}
