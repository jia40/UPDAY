import { useState, type FormEvent } from 'react'
import { useToday } from '../hooks/useToday'
import { useStudyMutation } from '../hooks/useStudyMutation'
import { useUnsavedChanges } from '../hooks/useUnsavedChanges'
import { createApplication, newApplicationId, updateApplication, validateApplication, type Application, type ApplicationInput, type ApplicationStatus } from '../lib/applications'
import { errorText } from '../lib/jobErrors'
import StatusOptions from './JobStatusOptions'
import ConfirmModal from './common/ConfirmModal'
import CompleteModal from './common/CompleteModal'

const empty: ApplicationInput = { company: '', position: '', url: '', status: 'interested', appliedAt: '', memo: '' }
export default function JobForm({ userId, record }: { userId: string; record?: Application }) {
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
