import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useToday } from '../hooks/useToday'
import { useStudyMutation } from '../hooks/useStudyMutation'
import { useUnsavedChanges } from '../hooks/useUnsavedChanges'
import { FirebaseError } from 'firebase/app'
import { applicationStatuses, changeApplicationStatus, createApplication, deleteApplication, fetchApplication, fetchApplications, newApplicationId, updateApplication, validateApplication, type Application, type ApplicationInput, type ApplicationStatus } from '../lib/applications'
import ConfirmModal from '../components/common/ConfirmModal'
import CompleteModal from '../components/common/CompleteModal'
import '../styles/job.css'

const empty: ApplicationInput = { company: '', position: '', url: '', status: 'interested', appliedAt: '', memo: '' }
function errorText(reason: unknown) {
  if (reason instanceof FirebaseError) return reason.code === 'permission-denied' ? '지원 기록 접근이 거부되었습니다. 로그인과 applications 접근 규칙을 확인해주세요.' : '요청에 실패했습니다. 연결 상태를 확인하고 다시 시도해주세요.'
  return reason instanceof Error ? reason.message : '요청에 실패했습니다. 다시 시도해주세요.'
}
function StatusOptions() { return Object.entries(applicationStatuses).map(([value, label]) => <option key={value} value={value}>{label}</option>) }
function JobForm({ userId, record }: { userId: string; record?: Application }) {
  const [initial] = useState<ApplicationInput>(() => record ? { company: record.company, position: record.position, url: record.url, status: record.status, appliedAt: record.appliedAt, memo: record.memo } : { ...empty })
  const [input, setInput] = useState(initial)
  const [complete, setComplete] = useState(false)
  const [id] = useState(() => record?.id ?? newApplicationId())
  const { pending, error, setError, status, mutate } = useStudyMutation(errorText)
  const today = useToday()
  const leave = useUnsavedChanges(!complete && (JSON.stringify(input) !== JSON.stringify(initial) || pending), pending)
  const detailUrl = '/job?application=' + encodeURIComponent(id)
  function submit(event: FormEvent) {
    event.preventDefault()
    if (leave.blocked || complete) return
    try { validateApplication(input) } catch (reason) { setError(errorText(reason)); return }
    void mutate(() => record ? updateApplication(record.id, input) : createApplication(id, userId, input), () => setComplete(true))
  }
  return <>
    <section className="job-panel"><h2>{record ? '지원 기록 수정' : '새 지원 기록'}</h2>
      <form onSubmit={submit} noValidate><fieldset disabled={leave.blocked || complete}>
        <label htmlFor="job-company">기업명 *</label><input id="job-company" required maxLength={100} value={input.company} onChange={e => setInput({ ...input, company: e.target.value })} />
        <label htmlFor="job-position">포지션 *</label><input id="job-position" required maxLength={100} value={input.position} onChange={e => setInput({ ...input, position: e.target.value })} />
        <label htmlFor="job-url">공고 URL (선택)</label><input id="job-url" type="url" maxLength={2000} placeholder="https://" value={input.url} onChange={e => setInput({ ...input, url: e.target.value })} />
        <label htmlFor="job-status">지원 상태</label><select id="job-status" value={input.status} onChange={e => setInput({ ...input, status: e.target.value as ApplicationStatus })}><StatusOptions /></select>
        <label htmlFor="job-date">지원일 (선택)</label><input id="job-date" type="date" min="0001-01-01" max={today} value={input.appliedAt} onChange={e => setInput({ ...input, appliedAt: e.target.value })} />
        <label htmlFor="job-memo">메모 (선택)</label><textarea id="job-memo" rows={8} maxLength={10000} value={input.memo} onChange={e => setInput({ ...input, memo: e.target.value })} />
        <div className="job-actions"><button className="job-primary" type="submit">{pending ? '저장 중…' : '지원 기록 저장'}</button><button type="button" onClick={() => leave.leave(record ? detailUrl : '/job')}>취소</button></div>
      </fieldset></form><p role="alert" className="job-error">{error}</p><p role="status">{status}</p>
    </section>
    <ConfirmModal open={leave.open} title="작성 내용 확인" message="작성 중인 내용은 저장되지 않습니다. 나가시겠습니까?" confirmLabel="나가기" cancelLabel="계속 작성" onClose={leave.cancel} onConfirm={leave.confirm} />
    <CompleteModal open={complete} message="지원 기록이 저장되었습니다." onClose={() => window.location.assign(detailUrl)} />
  </>
}
function JobDetail({ record }: { record: Application }) {
  const [detail, setDetail] = useState(record)
  const [confirm, setConfirm] = useState(false)
  const [deleted, setDeleted] = useState(false)
  const [message, setMessage] = useState('')
  const { pending, error, status, mutate } = useStudyMutation(errorText)
  return <><article className="job-panel"><h2 className="job-question">{detail.company}</h2><p className="job-question">{detail.position}</p>
    <p className="job-help">등록일 · {detail.createdAt.toDate().toLocaleDateString('ko-KR')} · 지원일 · {detail.appliedAt || '미입력'}</p>
    {detail.url && <a href={detail.url} target="_blank" rel="noopener noreferrer">채용 공고 열기</a>}
    <label htmlFor="job-detail-status">지원 상태</label><select id="job-detail-status" value={detail.status} disabled={pending || confirm || deleted} onChange={e => {
      const value = e.target.value as ApplicationStatus
      void mutate(() => changeApplicationStatus(detail.id, value), () => { setDetail({ ...detail, status: value }); setMessage('지원 상태가 저장되었습니다.') })
    }}><StatusOptions /></select>
    <h3>메모</h3><p className="job-answer">{detail.memo || '작성한 메모가 없습니다.'}</p>
    <div className="job-actions"><button disabled={pending || confirm || deleted} onClick={() => window.location.assign('/job?application=' + encodeURIComponent(detail.id) + '&edit=1')}>수정하기</button><button disabled={pending || confirm || deleted} onClick={() => setConfirm(true)}>삭제하기</button></div>
    <p role="alert" className="job-error">{error}</p><p role="status">{status || message}</p>
  </article><ConfirmModal open={confirm} title="지원 기록 삭제" message="이 지원 기록을 삭제하시겠습니까?" destructive confirmLabel="삭제" isPending={pending} error={error} onClose={() => { if (!pending) setConfirm(false) }} onConfirm={() => void mutate(() => deleteApplication(detail.id), () => { setConfirm(false); setDeleted(true) })} />
    <CompleteModal open={deleted} message="지원 기록이 삭제되었습니다." onClose={() => window.location.assign('/job')} /></>
}
function JobRecords({ userId, id, editing }: { userId: string; id: string | null; editing: boolean }) {
  const [records, setRecords] = useState<Application[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [filter, setFilter] = useState('')
  useEffect(() => {
    let active = true
    const request = id !== null ? fetchApplication(userId, id).then(item => item ? [item] : []) : fetchApplications(userId)
    request.then(items => { if (active) { setRecords(items); setError(''); setLoading(false) } }).catch(reason => { if (active) { setError(errorText(reason)); setLoading(false) } })
    return () => { active = false }
  }, [userId, id, retry])
  useEffect(() => {
    const restore = (event: PageTransitionEvent) => { if (event.persisted) { setLoading(true); setRetry(value => value + 1) } }
    window.addEventListener('pageshow', restore)
    return () => window.removeEventListener('pageshow', restore)
  }, [])
  if (loading) return <p role="status">지원 기록을 불러오고 있습니다.</p>
  if (error) return <section className="job-panel"><p role="alert">{error}</p><button onClick={() => { setLoading(true); setError(''); setRetry(value => value + 1) }}>다시 불러오기</button></section>
  if (id !== null) {
    const record = records[0]
    if (!record) return <section className="job-panel"><h2>지원 기록을 찾을 수 없습니다.</h2><a href="/job">목록으로 돌아가기</a></section>
    return editing ? <JobForm userId={userId} record={record} /> : <JobDetail record={record} />
  }
  const visible = records.filter(record => !filter || record.status === filter)
  return <section className="job-panel"><h2>내 지원 기록 {records.length}개</h2><label htmlFor="job-filter">지원 상태 필터</label><select id="job-filter" value={filter} onChange={e => setFilter(e.target.value)}><option value="">전체</option><StatusOptions /></select>
    {visible.length ? <ul className="job-list">{visible.map(record => <li key={record.id}><a href={'/job?application=' + encodeURIComponent(record.id)}><strong className="job-question">{record.company}</strong><span className="job-question">{record.position}</span><span className="job-help">{applicationStatuses[record.status]} · {record.appliedAt || '지원일 미입력'}</span></a></li>)}</ul> : <div className="job-empty"><p>{records.length ? '선택한 상태의 기록이 없습니다.' : '아직 등록한 지원 기록이 없습니다.'}</p>{!records.length && <a href="/job?new=1">첫 지원 기록 등록하기</a>}</div>}
  </section>
}
export default function JobPage() {
  const { user, isLoading, error } = useAuth()
  const params = new URLSearchParams(window.location.search)
  const id = params.get('application')
  const form = id === null && params.get('new') === '1'
  const editing = params.get('edit') === '1'
  if (error) return <p role="alert">{error}</p>
  if (isLoading || !user) return <p role="status">로그인 상태를 확인하고 있습니다.</p>
  return <section className="job-page"><header><p className="job-eyebrow">JOB</p><div className="job-heading-row"><h1>취업 지원</h1>{!form && id === null && <a className="job-new" href="/job?new=1">새 지원 기록</a>}</div><p className="job-help">관심 기업부터 합격까지, 지원 과정을 기록해보세요.</p></header>
    {id !== null && <a className="job-back" href="/job">← 목록으로</a>}
    {form ? <JobForm key={user.uid} userId={user.uid} /> : <JobRecords key={`${user.uid}:${id}:${editing}`} userId={user.uid} id={id} editing={editing} />}
  </section>
}
