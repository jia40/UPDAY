import { useEffect, useRef, useState, type FormEvent } from 'react'
import ConfirmModal from './common/ConfirmModal'
import CompleteModal from './common/CompleteModal'
import { useToday } from '../hooks/useToday'
import { useStudyMutation } from '../hooks/useStudyMutation'
import { errorText } from '../lib/studyErrors'
import { effectiveStudyDate } from '../lib/studyAnalytics'
import { createStudyLog, newStudyId, updateStudyLog, validateStudy, type StudyInput, type StudyLog } from '../lib/studyLogs'
import { useLogoutGuard } from '../hooks/useLogoutGuard'

const empty: StudyInput = { title: '', content: '', tags: '', studyMinutes: '', studyDate: '' }
export default function StudyForm({ userId, record }: { userId: string; record?: StudyLog }) {
  const today = useToday()
  const editing = record?.id
  const detailUrl = editing ? '/study?record=' + encodeURIComponent(editing) : '/study'
  const [initialForm] = useState(() => record ? {
    title: record.title, content: record.content, tags: record.tags.join(', '), studyMinutes: String(record.studyMinutes),
    studyDate: effectiveStudyDate(record) ?? '', hours: String(Math.floor(record.studyMinutes / 60)), minutes: String(record.studyMinutes % 60),
  } : { ...empty, studyDate: today, hours: '', minutes: '' })
  const [input, setInput] = useState<StudyInput>(() => ({ title: initialForm.title, content: initialForm.content, tags: initialForm.tags, studyMinutes: initialForm.studyMinutes, studyDate: initialForm.studyDate }))
  const [hours, setHours] = useState(initialForm.hours)
  const [minutes, setMinutes] = useState(initialForm.minutes)
  const [confirmation, setConfirmation] = useState<'cancel' | 'logout' | null>(null)
  const [completion, setCompletion] = useState<{ message: string; url: string } | null>(null)
  const [leaveUrl, setLeaveUrl] = useState<string | null>(null)
  const allowLeave = useRef(false)
  const createId = useRef<string | null>(null)
  const { error, setError, status, setStatus, pending, lock, mutate } = useStudyMutation()
  const logoutGuard = useLogoutGuard()
  const registerLogoutGuard = logoutGuard?.register
  const logoutDecision = useRef<((confirmed: boolean) => void) | null>(null)
  const blocked = pending || Boolean(logoutGuard?.loggingOut)
  const dirty = JSON.stringify({ ...input, hours, minutes }) !== JSON.stringify(initialForm)
  const protectChanges = !completion && (dirty || pending)
  useEffect(() => {
    if (!logoutGuard?.loggingOut) allowLeave.current = false
  }, [logoutGuard?.loggingOut])
  useEffect(() => {
    if (!registerLogoutGuard) return
    const unregister = registerLogoutGuard(async () => {
      if (lock.current) return false
      if (!protectChanges) return true
      setError('')
      setConfirmation('logout')
      return new Promise<boolean>(resolve => { logoutDecision.current = resolve })
    })
    return () => {
      unregister()
      logoutDecision.current?.(false)
      logoutDecision.current = null
    }
  }, [registerLogoutGuard, protectChanges, lock, setError])
  useEffect(() => {
    if (!protectChanges) return
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (allowLeave.current) return
      event.preventDefault()
      event.returnValue = ''
    }
    const followLink = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
      const link = event.target instanceof Element ? event.target.closest('a[href]') : null
      if (!(link instanceof HTMLAnchorElement) || link.hasAttribute('download') || (link.target && link.target !== '_self')) return
      const url = new URL(link.href, window.location.href)
      if (url.origin !== window.location.origin || !['http:', 'https:'].includes(url.protocol)) return
      if (url.pathname === window.location.pathname && url.search === window.location.search && url.hash) return
      event.preventDefault()
      event.stopPropagation()
      if (lock.current || logoutGuard?.loggingOut) return
      setLeaveUrl(url.href)
      setError('')
      setConfirmation('cancel')
    }
    const restore = () => { allowLeave.current = false }
    window.addEventListener('beforeunload', beforeUnload)
    window.addEventListener('pageshow', restore)
    document.addEventListener('click', followLink, true)
    return () => {
      window.removeEventListener('beforeunload', beforeUnload)
      window.removeEventListener('pageshow', restore)
      document.removeEventListener('click', followLink, true)
    }
  }, [protectChanges, lock, setError, logoutGuard?.loggingOut])

  function cancelForm() {
    if (lock.current) return
    if (!dirty) { window.location.assign(detailUrl); return }
    setLeaveUrl(detailUrl)
    setError('')
    setConfirmation('cancel')
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    if (lock.current || logoutGuard?.loggingOut) return
    setStatus('')
    const hourValue = Number(hours)
    const minuteValue = Number(minutes)
    if (!Number.isInteger(hourValue) || hourValue < 0 || hourValue > 24 || !Number.isInteger(minuteValue) || minuteValue < 0 || minuteValue > 59) {
      setError('시간은 0~24, 분은 0~59 사이의 정수로 입력해주세요.')
      return
    }
    const total = hourValue * 60 + minuteValue
    if (total < 1 || total > 1440) {
      setError('학습 시간은 최소 1분, 최대 24시간으로 입력해주세요.')
      return
    }
    const savedInput = { ...input, studyMinutes: String(total) }
    try { validateStudy(savedInput) } catch (reason) { setError(errorText(reason)); return }
    if (editing) void mutate(() => updateStudyLog(editing, savedInput), () => setCompletion({ message: '학습 기록 수정이 완료되었습니다.', url: detailUrl }))
    else {
      createId.current ??= newStudyId()
      const id = createId.current
      void mutate(() => createStudyLog(id, userId, savedInput), () => setCompletion({ message: '학습 기록 저장이 완료되었습니다.', url: '/study?record=' + encodeURIComponent(id) }))
    }
  }

  return <>
    <section className="study-panel" aria-labelledby="study-form-heading">
      <h2 id="study-form-heading">{editing ? '학습 기록 수정' : '새 학습 기록'}</h2>
      <form onSubmit={submit} noValidate>
        <fieldset disabled={blocked}>
          <label htmlFor="study-date">학습 날짜 *</label>
          <input id="study-date" type="date" required min="0001-01-01" max={today} value={input.studyDate} onChange={(e) => setInput({ ...input, studyDate: e.target.value })} aria-describedby="study-date-help" />
          <p id="study-date-help" className="study-help">실제로 공부한 날짜를 선택해주세요. 오늘과 지난 날짜를 기록할 수 있습니다.</p>
          <label htmlFor="study-title">제목 *</label>
          <input id="study-title" required value={input.title} maxLength={100} onChange={(e) => setInput({ ...input, title: e.target.value })} placeholder="오늘 무엇을 배웠나요?" />
          <label htmlFor="study-content">학습 내용 *</label>
          <textarea id="study-content" required rows={7} maxLength={10000} value={input.content} onChange={(e) => setInput({ ...input, content: e.target.value })} placeholder="배운 내용과 기억하고 싶은 점을 적어주세요." />
          <div className="study-duration" role="group" aria-labelledby="study-duration-label" aria-describedby="study-duration-help">
            <p id="study-duration-label">학습 시간 *</p>
            <div className="study-duration-inputs">
              <input id="study-hours" type="number" min={0} max={24} step={1} value={hours} onChange={(e) => setHours(e.target.value)} placeholder="0" />
              <label htmlFor="study-hours">시간</label>
              <input id="study-minutes" type="number" min={0} max={59} step={1} value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder="0" />
              <label htmlFor="study-minutes">분</label>
            </div>
            <p id="study-duration-help" className="study-help">최소 1분, 최대 24시간까지 기록할 수 있습니다.</p>
          </div>
          <label htmlFor="study-tags">태그 (선택)</label>
          <input id="study-tags" value={input.tags} onChange={(e) => setInput({ ...input, tags: e.target.value })} placeholder="React, JavaScript, CS" aria-describedby="study-tags-help" />
          <p id="study-tags-help" className="study-help">쉼표로 구분해주세요. 태그당 30자, 최대 10개까지 입력할 수 있습니다.</p>
          <div className="study-actions"><button className="study-primary" type="submit">{editing ? '수정 저장' : '기록 저장'}</button><button type="button" onClick={cancelForm}>취소</button></div>
        </fieldset>
      </form>
      <div className="study-feedback"><p role="alert">{error}</p><p role="status">{status}</p></div>
    </section>
    <ConfirmModal open={confirmation !== null} title={confirmation === 'logout' ? '로그아웃' : '작성 취소'}
      message={confirmation === 'logout' ? '로그아웃하시겠습니까? 작성 중인 내용은 저장되지 않습니다.' : '작성을 취소하고 돌아가시겠습니까? 작성 중인 내용은 저장되지 않습니다.'}
      confirmLabel={confirmation === 'logout' ? '로그아웃' : '나가기'} cancelLabel="계속 작성" isPending={pending} error={error}
      onClose={() => { if (!lock.current) { setConfirmation(null); setError(''); logoutDecision.current?.(false); logoutDecision.current = null } }}
      onConfirm={() => {
        if (lock.current) return
        if (confirmation === 'logout') { allowLeave.current = true; setConfirmation(null); logoutDecision.current?.(true); logoutDecision.current = null; return }
        allowLeave.current = true; window.location.assign(leaveUrl ?? detailUrl)
      }} />
    <CompleteModal open={completion !== null} message={completion?.message} onClose={() => { if (completion) window.location.assign(completion.url) }} />
  </>
}
