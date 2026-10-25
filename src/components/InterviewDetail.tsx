import { useEffect, useRef, useState } from 'react'
import ConfirmModal from './common/ConfirmModal'
import CompleteModal from './common/CompleteModal'
import Tags from './InterviewTags'
import { deleteInterviewQuestion, fetchInterviewQuestion, interviewStatuses, reviewInterviewQuestion, updateInterviewStatus, type InterviewQuestion, type InterviewStatus } from '../lib/interviewQuestions'
import { errorMessage } from '../lib/interviewErrors'
export default function InterviewDetail({ record }: { record: InterviewQuestion }) {
  const [detail, setDetail] = useState(record)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [confirmation, setConfirmation] = useState(false)
  const [deleted, setDeleted] = useState(false)
  const [message, setMessage] = useState('')
  const lock = useRef(false)
  const active = useRef(false)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  async function run(action: () => Promise<void>, done: () => void) {
    if (lock.current) return
    lock.current = true; setPending(true); setError(''); setMessage('')
    try {
      if (!navigator.onLine) throw new Error('네트워크 연결을 확인한 후 다시 시도해주세요.')
      await action()
      if (active.current) done()
    } catch (reason) { if (active.current) setError(errorMessage(reason)) }
    finally { lock.current = false; if (active.current) setPending(false) }
  }
  async function refresh() {
    const saved = await fetchInterviewQuestion(detail.userId, detail.id)
    if (!saved) throw new Error('질문을 찾을 수 없습니다. 목록에서 확인해주세요.')
    if (active.current) setDetail(saved)
  }
  return <>
    <article className="interview-panel" aria-labelledby="interview-detail-heading">
      <h2 id="interview-detail-heading" className="interview-question">{detail.question}</h2>
      <p className="interview-help">등록일 · {detail.createdAt?.toDate().toLocaleDateString('ko-KR') ?? '확인 중'}</p>
      <Tags tags={detail.tags} />
      <h3>답변</h3><p className="interview-answer">{detail.answer || '아직 작성한 답변이 없습니다.'}</p>
      <label htmlFor="interview-status">이해 상태</label>
      <select id="interview-status" value={detail.status} disabled={pending || confirmation || deleted} onChange={event => {
        const status = event.target.value as InterviewStatus
        void run(() => updateInterviewStatus(detail.id, status), () => { setDetail(value => ({ ...value, status })); setMessage('이해 상태가 저장되었습니다.') })
      }}>{Object.entries(interviewStatuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
      <p className="interview-help">마지막 복습 · {detail.lastReviewedAt?.toDate().toLocaleString('ko-KR') ?? '아직 복습하지 않았습니다.'}</p>
      <div className="interview-actions">
        <button type="button" disabled={pending || confirmation || deleted} onClick={() => void run(async () => { await reviewInterviewQuestion(detail.id); await refresh() }, () => setMessage('복습이 기록되었습니다.'))}>복습 완료</button>
        <button type="button" disabled={pending || confirmation || deleted} onClick={() => window.location.assign('/interview?question=' + encodeURIComponent(detail.id) + '&edit=1')}>수정하기</button>
        <button type="button" disabled={pending || confirmation || deleted} onClick={() => { setError(''); setConfirmation(true) }}>삭제하기</button>
      </div>
      <p className="interview-error" role="alert">{error}</p><p role="status">{pending ? '처리 중입니다.' : message}</p>
    </article>
    <ConfirmModal open={confirmation} title="면접 질문 삭제" message="이 질문을 삭제하시겠습니까?" destructive confirmLabel="삭제" isPending={pending} error={error}
      onClose={() => { if (!lock.current) { setConfirmation(false); setError('') } }}
      onConfirm={() => void run(() => deleteInterviewQuestion(detail.id), () => { setConfirmation(false); setDeleted(true) })} />
    <CompleteModal open={deleted} message="면접 질문이 삭제되었습니다." onClose={() => window.location.assign('/interview')} />
  </>
}
