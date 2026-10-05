import { useEffect, useRef, useState } from 'react'
import { errorText } from '../lib/studyErrors'

export function useStudyMutation() {
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [pending, setPending] = useState(false)
  const lock = useRef(false)
  const active = useRef(false)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  async function mutate(action: () => Promise<void>, done: () => void) {
    if (lock.current) return
    lock.current = true
    setPending(true)
    setError('')
    setStatus('저장 중입니다. 연결이 끊겼다면 연결 후 완료됩니다.')
    try {
      if (!navigator.onLine) throw new Error('네트워크 연결을 확인하고 다시 시도해주세요.')
      await action()
      if (!active.current) return
      setStatus('')
      done()
    } catch (reason) {
      if (active.current) { setError(errorText(reason)); setStatus('') }
    } finally {
      lock.current = false
      if (active.current) setPending(false)
    }
  }

  return { error, setError, status, setStatus, pending, lock, mutate }
}
