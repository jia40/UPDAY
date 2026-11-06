import { useCallback, useRef, useState } from 'react'
import { fetchApplicationPage, type Application, type ApplicationCursor } from '../lib/applications'
import { errorText } from '../lib/jobErrors'
import { useRefreshTask } from './useRefreshTask'
import { usePageRefresh } from './usePageRefresh'

// The list is keyed by account/filter, so cursor and responses never cross them.
export function useJobPage(userId: string, status: string) {
  const [items, setItems] = useState<Application[]>([])
  const [pending, setPending] = useState(true)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState('')
  const cursor = useRef<ApplicationCursor | undefined>(undefined)
  const mode = useRef<'replace' | 'append'>('replace')
  const busy = useRef(true)
  const load = useCallback(async (current: () => boolean) => {
    const append = mode.current === 'append'
    busy.current = true; setPending(true); setError('')
    try {
      const page = await fetchApplicationPage(userId, status, append ? cursor.current : undefined)
      if (!current()) return
      setItems(previous => {
        if (!append) return page.items
        const ids = new Set(previous.map(item => item.id))
        return [...previous, ...page.items.filter(item => !ids.has(item.id))]
      })
      cursor.current = page.cursor
      setHasMore(page.hasMore); setHasLoaded(true)
    } catch (reason) { if (current()) setError(errorText(reason)) }
    finally { if (current()) { busy.current = false; setPending(false) } }
  }, [userId, status])
  const task = useRefreshTask(load)
  const refresh = useCallback(() => {
    // A return refresh supersedes an in-flight additional page. Repeated first
    // page refreshes share the current request through the same queue.
    if (mode.current === 'append') task.invalidate()
    mode.current = 'replace'; busy.current = true
    return task.request()
  }, [task])
  usePageRefresh(refresh)
  function loadMore() {
    if (busy.current || !hasMore) return
    mode.current = 'append'; busy.current = true; void task.request()
  }
  function retry() {
    if (busy.current) return
    busy.current = true; void task.request()
  }
  return { items, pending, error, hasLoaded, hasMore, loadMore, retry }
}
