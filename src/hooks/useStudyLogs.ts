import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchStudyLog, fetchStudyOverview, type StudyLog, type StudySummary } from '../lib/studyLogs'
import { errorText } from '../lib/studyErrors'

// The caller keys the screen by account and route to discard previous state.
export function useStudyLogs(userId: string, selected: string | null, formView: boolean) {
  const [record, setRecord] = useState<StudyLog | null>(null)
  const [overview, setOverview] = useState<StudySummary[]>([])
  const [loading, setLoading] = useState(!formView || Boolean(selected))
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const forceNext = useRef(false)
  const reload = useCallback((force = true) => { forceNext.current = force; setLoading(true); setError(''); setRevision(value => value + 1) }, [])
  useEffect(() => {
    if (formView && !selected) return
    let cancelled = false
    const force = forceNext.current
    forceNext.current = false
    const request = selected ? fetchStudyLog(userId, selected).then(record => ({ record, summary: [] as StudySummary[] }))
      : fetchStudyOverview(userId, { force }).then(summary => ({ record: null, summary }))
    request.then(result => {
      if (!cancelled) { setRecord(result.record); setOverview(result.summary); setError(''); setLoading(false) }
    }).catch(reason => { if (!cancelled) { setError(errorText(reason)); setLoading(false) } })
    return () => { cancelled = true }
  }, [userId, selected, formView, revision])
  useEffect(() => {
    if (formView || selected) return
    const restore = (event: PageTransitionEvent) => { if (event.persisted) reload(false) }
    const refresh = () => reload(false)
    const visible = () => { if (document.visibilityState === 'visible') refresh() }
    window.addEventListener('pageshow', restore)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', visible)
    return () => { window.removeEventListener('pageshow', restore); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', visible) }
  }, [formView, selected, reload])
  return { record, overview, loading, error, reload, revision }
}
