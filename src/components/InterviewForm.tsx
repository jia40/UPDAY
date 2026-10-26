import { useRef, useState, type FormEvent } from 'react'
import { useUnsavedChanges } from '../hooks/useUnsavedChanges'
import ConfirmModal from './common/ConfirmModal'
import CompleteModal from './common/CompleteModal'
import { createInterviewQuestion, newInterviewId, updateInterviewQuestion, validateInterview, type InterviewInput, type InterviewQuestion } from '../lib/interviewQuestions'
import { errorMessage } from '../lib/interviewErrors'
import { useStudyMutation } from '../hooks/useStudyMutation'
export default function InterviewForm({ userId, record }: { userId: string; record?: InterviewQuestion }) {
  const [initial] = useState<InterviewInput>(() => record ? { question: record.question, answer: record.answer, tags: record.tags.join(', ') } : { question: '', answer: '', tags: '' })
  const [input, setInput] = useState<InterviewInput>(initial)
  const { pending, error, setError, lock, mutate } = useStudyMutation(errorMessage)
  const [complete, setComplete] = useState(false)
  const dirty = JSON.stringify(input) !== JSON.stringify(initial)
  const leave = useUnsavedChanges(!complete && (dirty || pending), pending)
  const id = useRef<string | null>(null)
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (lock.current || complete || leave.blocked) return
    setError('')
    try { validateInterview(input) } catch (reason) { setError(errorMessage(reason)); return }
    id.current ??= record?.id ?? newInterviewId()
    void mutate(() => record ? updateInterviewQuestion(record.id, input) : createInterviewQuestion(id.current!, userId, input), () => setComplete(true))
  }
  return <>
    <section className="interview-panel" aria-labelledby="interview-form-heading">
      <h2 id="interview-form-heading">{record ? '면접 질문 수정' : '새 면접 질문'}</h2>
      <form onSubmit={submit} noValidate>
        <fieldset disabled={leave.blocked || complete}>
          <label htmlFor="interview-question">질문 *</label>
          <textarea id="interview-question" rows={3} required maxLength={300} value={input.question} onChange={(e) => setInput({ ...input, question: e.target.value })} placeholder="예: 클로저란 무엇인가요?" aria-describedby="interview-question-help" />
          <p id="interview-question-help" className="interview-help">질문은 1~300자로 입력해주세요.</p>
          <label htmlFor="interview-answer">답변 (선택)</label>
          <textarea id="interview-answer" rows={9} maxLength={10000} value={input.answer} onChange={(e) => setInput({ ...input, answer: e.target.value })} placeholder="아직 답변을 몰라도 질문부터 저장할 수 있어요." aria-describedby="interview-answer-help" />
          <p id="interview-answer-help" className="interview-help">답변은 최대 10,000자까지 입력할 수 있습니다.</p>
          <label htmlFor="interview-tags">태그 (선택)</label>
          <input id="interview-tags" value={input.tags} onChange={(e) => setInput({ ...input, tags: e.target.value })} placeholder="JavaScript, React, CS" aria-describedby="interview-tags-help" />
          <p id="interview-tags-help" className="interview-help">쉼표로 구분해주세요. 태그당 30자, 최대 10개까지 저장됩니다.</p>
          <div className="interview-actions"><button className="interview-primary" type="submit">{pending ? '저장 중…' : '질문 저장'}</button><button type="button" onClick={() => leave.leave(record ? '/interview?question=' + encodeURIComponent(record.id) : '/interview')}>취소</button></div>
        </fieldset>
      </form>
      <p className="interview-error" role="alert">{error}</p>
      <p role="status">{pending ? '저장하고 있습니다. 연결이 끊겼다면 다시 연결될 때까지 기다려주세요.' : ''}</p>
    </section>
    <ConfirmModal open={leave.open} title="작성 내용 확인" message="작성 중인 내용은 저장되지 않습니다. 나가시겠습니까?" confirmLabel="나가기" cancelLabel="계속 작성" onClose={leave.cancel} onConfirm={leave.confirm} />
    <CompleteModal open={complete} message="면접 질문이 저장되었습니다." confirmLabel="질문 보러가기" onClose={() => window.location.assign('/interview?question=' + encodeURIComponent(id.current!))} />
  </>
}
