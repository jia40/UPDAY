import { useCallback, useEffect, useState } from 'react'
import { fetchInterviewQuestion, type InterviewQuestion } from '../lib/interviewQuestions'
import { fetchInterviewOverview, type InterviewMetadata } from '../lib/interviewPagination'
import { errorMessage } from '../lib/interviewErrors'

// Caller keys the screen by account and route, discarding previous state.
export function useInterviewRecords(userId: string, questionId: string | null) {
  const [record, setRecord] = useState<InterviewQuestion | null>(null)
  const [overview, setOverview] = useState<InterviewMetadata[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const reload = useCallback(() => { setLoading(true); setError(''); setRevision(value => value + 1) }, [])
  useEffect(() => {
    let active = true
    const request = questionId !== null
      ? fetchInterviewQuestion(userId, questionId).then(record => ({ record, overview: [] as InterviewMetadata[] }))
      : fetchInterviewOverview(userId).then(overview => ({ record: null, overview }))
    request.then(result => { if (active) { setRecord(result.record); setOverview(result.overview); setError(''); setLoading(false) } })
      .catch(reason => { if (active) { setError(errorMessage(reason)); setLoading(false) } })
    return () => { active = false }
  }, [userId, questionId, revision])
  useEffect(() => {
    const restore = (event: PageTransitionEvent) => { if (event.persisted) reload() }
    const visible = () => { if (document.visibilityState === 'visible') reload() }
    window.addEventListener('pageshow', restore)
    if (questionId === null) document.addEventListener('visibilitychange', visible)
    return () => { window.removeEventListener('pageshow', restore); document.removeEventListener('visibilitychange', visible) }
  }, [questionId, reload])
  return { record, overview, loading, error, revision, reload }
}
