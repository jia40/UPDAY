import { useState } from 'react'
import { useStudyMutation } from '../hooks/useStudyMutation'
import { changeApplicationStatus, deleteApplication, type Application, type ApplicationStatus } from '../lib/applications'
import { errorText } from '../lib/jobErrors'
import StatusOptions from './JobStatusOptions'
import ConfirmModal from './common/ConfirmModal'
import CompleteModal from './common/CompleteModal'

export default function JobDetail({ record }: { record: Application }) {
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
