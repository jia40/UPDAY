import { useCallback, useState } from 'react'
import { FirebaseError } from 'firebase/app'
import { deleteDailyNote, fetchDailyNote, saveDailyNote, singleLine } from '../lib/dailyNotes'
import { usePageRefresh } from './usePageRefresh'
import { useRefreshTask } from './useRefreshTask'
import { useStudyMutation } from './useStudyMutation'

function noteError(reason: unknown) {
  if (reason instanceof FirebaseError) return reason.code === 'permission-denied'
    ? '한 줄 기록에 접근할 수 없습니다. 로그인 상태를 확인해주세요.'
    : '한 줄 기록을 처리하지 못했습니다. 연결 상태를 확인하고 다시 시도해주세요.'
  return reason instanceof Error ? reason.message : '한 줄 기록을 처리하지 못했습니다.'
}

// Today keys the caller by UID and selected date.
export function useDailyNote(userId: string, date: string) {
  const [value, setValue] = useState<{ saved: string | null; draft: string }>({ saved: null, draft: '' })
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const { pending, lock, error, setError, status, setStatus, mutate } = useStudyMutation(noteError)
  const dirty = value.draft !== (value.saved ?? '')
  const load = useCallback(async (current: () => boolean) => {
    setLoading(true)
    try {
      const saved = await fetchDailyNote(userId, date)
      if (current()) {
        setValue(previous => ({ saved, draft: previous.draft === (previous.saved ?? '') ? saved : previous.draft }))
        setLoadError('')
      }
    } catch {
      if (current()) setLoadError('한 줄 기록을 불러오지 못했습니다. 다시 시도해주세요.')
    } finally { if (current()) setLoading(false) }
  }, [userId, date])
  const task = useRefreshTask(load, dirty || pending || confirmDelete)
  usePageRefresh(task.request)

  function write(remove: boolean) {
    if (lock.current || value.saved === null || (remove && !value.saved) || (!remove && (!dirty || confirmDelete))) return
    task.invalidate()
    setLoading(false)
    const saved = remove ? '' : singleLine(value.draft).trim()
    void mutate(() => remove ? deleteDailyNote(userId, date) : saveDailyNote(userId, date, value.draft), () => {
      setValue({ saved, draft: saved }); setConfirmDelete(false); setLoadError('')
      setStatus(remove ? '한 줄 기록을 삭제했습니다.' : '한 줄 기록을 저장했습니다.')
    })
  }
  return {
    ...value, loading, loadError, confirmDelete, pending, lock, error, status, dirty,
    change: (draft: string) => { setValue(previous => ({ ...previous, draft: singleLine(draft) })); setError(''); setStatus('') },
    reset: () => { setValue(previous => ({ ...previous, draft: previous.saved ?? '' })); setError(''); setStatus('') },
    retry: () => { if (!lock.current) void task.request(true) },
    save: () => write(false), remove: () => write(true),
    openDelete: () => { setError(''); setConfirmDelete(true) },
    closeDelete: () => { if (!lock.current) { setError(''); setConfirmDelete(false) } },
  }
}
