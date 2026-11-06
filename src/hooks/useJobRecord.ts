import { useCallback, useState } from 'react'
import { fetchApplication, type Application } from '../lib/applications'
import { errorText } from '../lib/jobErrors'
import { useRefreshTask } from './useRefreshTask'

export function useJobRecord(userId: string, id: string) {
  const [record, setRecord] = useState<Application | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const load = useCallback(async (current: () => boolean) => {
    try {
      const result = await fetchApplication(userId, id)
      if (current()) { setRecord(result); setError('') }
    } catch (reason) { if (current()) setError(errorText(reason)) }
    finally { if (current()) setLoading(false) }
  }, [userId, id])
  const task = useRefreshTask(load)
  function retry() { setLoading(true); void task.request() }
  return { record, loading, error, retry }
}
