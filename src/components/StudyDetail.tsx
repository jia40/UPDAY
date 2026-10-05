import { useState } from 'react'
import ConfirmModal from './common/ConfirmModal'
import CompleteModal from './common/CompleteModal'
import StudyRecordActions from './StudyRecordActions'
import { useStudyMutation } from '../hooks/useStudyMutation'
import { deleteStudyLog, type StudyLog } from '../lib/studyLogs'
import { effectiveStudyDate, formatStudyTime } from '../lib/studyAnalytics'

export default function StudyDetail({ record: detail }: { record: StudyLog }) {
  const [confirmation, setConfirmation] = useState<'delete' | null>(null)
  const [complete, setComplete] = useState(false)
  const { error, setError, status, pending, lock, mutate } = useStudyMutation()
  const detailUrl = '/study?record=' + encodeURIComponent(detail.id)
  return <>
    <section className="study-panel" aria-labelledby="study-detail-title">
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
    </section>

    <ConfirmModal open={confirmation !== null} title="학습 기록 삭제" message="이 학습 기록을 삭제하시겠습니까?" confirmLabel="삭제하기" destructive isPending={pending} error={error}
      onClose={() => { if (!lock.current) { setConfirmation(null); setError('') } }}
      onConfirm={() => void mutate(() => deleteStudyLog(detail.id), () => { setConfirmation(null); setComplete(true) })} />
    <CompleteModal open={complete} message="학습 기록 삭제가 완료되었습니다." onClose={() => window.location.assign('/study')} />
  </>
}
