import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchInterviewPage, type InterviewCursor, type InterviewListItem, type InterviewMetadata } from '../lib/interviewPagination'
import type { InterviewFilters } from '../lib/interviewReview'
import { errorMessage } from '../lib/interviewErrors'

export function useInterviewPage(userId: string, filters: InterviewFilters, today: string, overview: InterviewMetadata[]) {
  const [items, setItems] = useState<InterviewListItem[]>([])
  const [pending, setPending] = useState(true)
  const [error, setError] = useState('')
  const [hasMore, setHasMore] = useState(false)
  const cursor = useRef<InterviewCursor | undefined>(undefined)
  const lock = useRef(false)
  const active = useRef(false)
  const load = useCallback(async () => {
    if (lock.current) return
    lock.current = true; setPending(true); setError('')
    try {
      const page = await fetchInterviewPage(userId, filters, today, cursor.current, overview)
      if (!active.current) return
      setItems(previous => { const ids = new Set(previous.map(item => item.id)); return [...previous, ...page.items.filter(item => !ids.has(item.id))] })
      cursor.current = page.cursor; setHasMore(page.hasMore)
    } catch (reason) { if (active.current) setError(errorMessage(reason)) }
    finally { lock.current = false; if (active.current) setPending(false) }
  }, [userId, filters, today, overview])
  useEffect(() => { active.current = true; void load(); return () => { active.current = false } }, [load])
  return { items, pending, error, hasMore, load }
}
