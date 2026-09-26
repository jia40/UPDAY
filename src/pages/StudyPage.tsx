import ConfirmModal from '../components/common/ConfirmModal'
import CompleteModal from '../components/common/CompleteModal'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { FirebaseError } from 'firebase/app'
import { useAuth } from '../hooks/useAuth'
import { createStudyLog, deleteStudyLog, fetchStudyLogs, newStudyId, updateStudyLog, validateStudy, type StudyInput, type StudyLog } from '../lib/studyLogs'
import StudyRecordActions from '../components/StudyRecordActions'
import '../styles/study.css'
import StudyHeatmap from '../components/StudyHeatmap'
import StudyWeeklyStats from '../components/StudyWeeklyStats'
import { effectiveStudyDate, filterStudyLogs, formatStudyTime, studyLogDate } from '../lib/studyAnalytics'
import { useToday } from '../hooks/useToday'
import { createStudyHeatmap, studyYears, type StudyPeriod } from '../lib/studyHeatmap'

const empty: StudyInput = { title: '', content: '', tags: '', studyMinutes: '', studyDate: '' }
function errorText(error: unknown) {
  if (error instanceof FirebaseError) {
    return error.code === 'permission-denied'
      ? '학습 기록 접근이 거부되었습니다. 로그인과 Firestore의 studyLogs 규칙을 확인해주세요.'
      : '요청에 실패했습니다. 연결 상태를 확인하고 다시 시도해주세요.'
  }
  return error instanceof Error ? error.message : '요청에 실패했습니다. 다시 시도해주세요.'
}

function StudyContent({ userId }: { userId: string }) {
  const today = useToday()
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [selectedTag, setSelectedTag] = useState('')
  const [period, setPeriod] = useState<StudyPeriod>('recent')
  const [logs, setLogs] = useState<StudyLog[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [pending, setPending] = useState(false)
  const [confirmation, setConfirmation] = useState<'delete' | 'cancel' | null>(null)
  const [completion, setCompletion] = useState<{ message: string; url: string } | null>(null)
  const [retry, setRetry] = useState(0)
  const [input, setInput] = useState<StudyInput>(() => ({ ...empty, studyDate: today }))
  const [hours, setHours] = useState('')
  const [minutes, setMinutes] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const params = new URLSearchParams(window.location.search)
  const selected = params.get('record')
  const formView = params.get('new') === '1' || params.get('edit') === '1'
  const detailUrl = selected ? `/study?record=${encodeURIComponent(selected)}` : '/study'
  const lock = useRef(false)
  const active = useRef(false)
  const createId = useRef<string | null>(null)
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    active.current = true
    return () => { active.current = false }
  }, [])
  useEffect(() => {
    let cancelled = false
    fetchStudyLogs(userId).then((items) => {
      if (!cancelled) {
        setLogs(items); setLoading(false); setLoadError('')
        if (new URLSearchParams(window.location.search).get('edit') === '1') {
          const log = items.find((item) => item.id === selected)
          if (log) {
            setEditing(log.id)
            setInput({ title: log.title, content: log.content, tags: log.tags.join(', '), studyMinutes: String(log.studyMinutes), studyDate: effectiveStudyDate(log) ?? '' })
            setHours(String(Math.floor(log.studyMinutes / 60)))
            setMinutes(String(log.studyMinutes % 60))
          }
        }
      }
    }).catch((reason: unknown) => {
      if (!cancelled) { setLoadError(errorText(reason)); setLoading(false) }
    })
    return () => { cancelled = true }
  }, [userId, retry, selected])

  useEffect(() => {
    if (formView || selected) return
    // Normal navigation already fetches on mount; only refetch restored bfcache lists.
    const restore = (event: PageTransitionEvent) => {
      if (event.persisted) { setLoading(true); setLoadError(''); setRetry((value) => value + 1) }
    }
    window.addEventListener('pageshow', restore)
    return () => window.removeEventListener('pageshow', restore)
  }, [formView, selected])

  const dates = useMemo(() => logs.map(studyLogDate), [logs])
  const years = useMemo(() => studyYears(dates, today), [dates, today])
  const activePeriod = typeof period === 'number' && !years.includes(period) ? 'recent' : period
  const heatmap = useMemo(() => createStudyHeatmap(dates, today, activePeriod), [dates, today, activePeriod])
  const filterDate = selectedDate && selectedDate >= heatmap.days[0].date && selectedDate <= heatmap.days[heatmap.days.length - 1].date ? selectedDate : null
  const tags = useMemo(() => [...new Set(logs.flatMap((log) => log.tags))].sort((a, b) => a.localeCompare(b, 'ko')), [logs])
  const filterTag = tags.includes(selectedTag) ? selectedTag : ''
  const visibleLogs = filterStudyLogs(logs, filterDate, filterTag)

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
      setConfirmation(null)
      setStatus('')
      done()
    } catch (reason) {
      if (active.current) { setError(errorText(reason)); setStatus('') }
    } finally {
      lock.current = false
      if (active.current) setPending(false)
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault()
    if (lock.current) return
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
  const detail = logs.find((log) => log.id === selected)
  const blocked = pending || loading || Boolean(loadError)
  return (
    <section className="study-page" aria-labelledby="study-heading">
      <header>
        <p className="study-eyebrow">STUDY</p>
        <div className="study-heading-row">
          <h1 id="study-heading">내 학습 기록</h1>
          {!formView && !selected && <a className="study-page-link" href="/study?new=1">새 학습 기록</a>}
        </div>
      </header>
      {selected && !formView && <a className="study-back" href="/study">← 목록으로</a>}
      <div className="study-grid">
        {loadError && <div className="study-panel" role="alert"><p>{loadError}</p><button type="button" disabled={pending} onClick={() => { setLoading(true); setLoadError(''); setRetry((n) => n + 1) }}>다시 불러오기</button></div>}
        {formView && (!selected || detail) &&
        <section className="study-panel" aria-labelledby="study-form-heading">
          <h2 id="study-form-heading">{editing ? '학습 기록 수정' : '새 학습 기록'}</h2>
          <form onSubmit={submit} noValidate>
            <fieldset disabled={blocked}>
              <label htmlFor="study-date">학습 날짜 *</label>
              <input id="study-date" type="date" required min="0001-01-01" max={today} value={input.studyDate} onChange={(e) => setInput({ ...input, studyDate: e.target.value })} aria-describedby="study-date-help" />
              <p id="study-date-help" className="study-help">실제로 공부한 날짜를 선택해주세요. 오늘과 지난 날짜를 기록할 수 있습니다.</p>
              <label htmlFor="study-title">제목 *</label>
              <input ref={titleRef} id="study-title" required value={input.title} maxLength={100} onChange={(e) => setInput({ ...input, title: e.target.value })} placeholder="오늘 무엇을 배웠나요?" />
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
              <div className="study-actions"><button className="study-primary" type="submit">{editing ? '수정 저장' : '기록 저장'}</button><button type="button" onClick={() => { setError(''); setConfirmation('cancel') }}>취소</button></div>
            </fieldset>
          </form>
          <div className="study-feedback"><p role="alert">{error}</p><p role="status">{status}</p></div>
        </section>
        }
        {!formView && !selected && !loading && !loadError && <StudyHeatmap data={heatmap} selectedDate={filterDate} onSelect={setSelectedDate}
          period={activePeriod} years={years} onPeriodChange={(value) => { setPeriod(value); setSelectedDate(null) }} />}
        {!formView && !selected && !loading && !loadError && <StudyWeeklyStats logs={logs} today={today} />}
        {!formView && !selected && <section className="study-panel" aria-label="학습 기록 목록">
          {!loading && !loadError && <div className="study-filter">
            <div className="study-tag-filter"><label htmlFor="study-tag-filter">태그 필터</label><select id="study-tag-filter" value={filterTag} onChange={(e) => setSelectedTag(e.target.value)}><option value="">전체 태그</option>{tags.map((tag) => <option key={tag} value={tag}>{tag}</option>)}</select></div>
            <p role="status">{filterDate || filterTag ? [filterDate, filterTag, '학습 기록 ' + visibleLogs.length + '개'].filter(Boolean).join(' · ') : '전체 학습 기록 ' + logs.length + '개'}</p>
            {(filterDate || filterTag) && <button type="button" onClick={() => { setSelectedDate(null); setSelectedTag('') }}>필터 해제</button>}
          </div>}
          {loading ? <p role="status">학습 기록을 불러오고 있습니다.</p> : !loadError && (visibleLogs.length === 0 ? <p className="study-empty">{filterDate || filterTag ? '선택한 조건에 맞는 학습 기록이 없어요. 필터를 해제해보세요.' : '아직 학습 기록이 없어요. 오늘 배운 내용을 남겨보세요.'}</p> :
            <ul className="study-list">{visibleLogs.map((log) => <li key={log.id}>
              <a className="study-record" href={`/study?record=${encodeURIComponent(log.id)}`}>
                <strong>{log.title}</strong><span>{effectiveStudyDate(log) ?? '날짜 없음'} · {formatStudyTime(log.studyMinutes)}</span>
                {log.tags.length > 0 && <span className="study-tags">{log.tags.map((tag) => <span key={tag}>{tag}</span>)}</span>}
              </a>
            </li>)}</ul>)}
        </section>}
        {selected && !formView && detail && <section className="study-panel" aria-labelledby="study-detail-title">
          <div className="study-detail-toolbar">
            <h2 id="study-detail-title">{detail.title}</h2>
            <StudyRecordActions key={detail.id} title={detail.title} disabled={pending}
              onEdit={() => window.location.assign(`${detailUrl}&edit=1`)}
              onDelete={() => { setError(''); setConfirmation('delete') }} />
          </div>
          <p className="study-help">{effectiveStudyDate(detail) ?? '날짜 없음'} · {formatStudyTime(detail.studyMinutes)}</p>
          <div className="study-tags">{detail.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
          <p className="study-content">{detail.content}</p>
          <div className="study-feedback"><p role="alert">{error}</p><p role="status">{status}</p></div>
        </section>}
        {selected && loading && <p role="status">학습 기록을 불러오고 있습니다.</p>}
        {selected && !loading && !loadError && !detail && <section className="study-panel"><p>학습 기록을 찾을 수 없습니다.</p><a href="/study">목록으로</a></section>}
      </div>
      <ConfirmModal open={confirmation !== null} title={confirmation === 'delete' ? '학습 기록 삭제' : '작성 취소'}
        message={confirmation === 'delete' ? '이 학습 기록을 삭제하시겠습니까?' : '작성을 취소하고 돌아가시겠습니까? 작성 중인 내용은 저장되지 않습니다.'}
        confirmLabel={confirmation === 'delete' ? '삭제하기' : '나가기'} destructive={confirmation === 'delete'}
        isPending={pending} error={error} onClose={() => { if (!lock.current) { setConfirmation(null); setError('') } }}
        onConfirm={() => {
          if (lock.current) return
          if (confirmation === 'cancel') { window.location.assign(detailUrl); return }
          if (detail) void mutate(() => deleteStudyLog(detail.id), () => setCompletion({ message: '학습 기록 삭제가 완료되었습니다.', url: '/study' }))
        }} />
      <CompleteModal open={completion !== null} message={completion?.message} onClose={() => {
        if (completion) window.location.assign(completion.url)
      }} />
    </section>
  )
}
export default function StudyPage() {
  const { user, isLoading, error } = useAuth()
  if (error) return <p role="alert">{error}</p>
  if (isLoading || !user) return <p role="status">로그인 상태를 확인하고 있습니다.</p>
  return <StudyContent key={user.uid} userId={user.uid} />
}
