import { useEffect, useRef, useState, type FormEvent } from 'react'
import { FirebaseError } from 'firebase/app'
import { useAuth } from '../hooks/useAuth'
import ConfirmModal from '../components/common/ConfirmModal'
import CompleteModal from '../components/common/CompleteModal'
import { createInterviewQuestion, fetchInterviewQuestion, fetchInterviewQuestions, newInterviewId, validateInterview, type InterviewInput, type InterviewQuestion } from '../lib/interviewQuestions'
import '../styles/interview.css'

function errorMessage(error: unknown) {
  if (error instanceof FirebaseError) {
    if (error.code === 'permission-denied') return '면접 질문에 접근할 권한이 없습니다. 로그인 상태와 데이터 접근 설정을 확인해주세요.'
    return '요청을 완료하지 못했습니다. 연결 상태를 확인하고 다시 시도해주세요.'
  }
  return error instanceof Error && error.message ? error.message : '요청에 실패했습니다. 다시 시도해주세요.'
}
function Tags({ tags }: { tags: string[] }) {
  return tags.length > 0 && <div className="interview-tags">{tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
}
function InterviewForm({ userId }: { userId: string }) {
  const [input, setInput] = useState<InterviewInput>({ question: '', answer: '', tags: '' })
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [complete, setComplete] = useState(false)
  const [cancel, setCancel] = useState(false)
  const lock = useRef(false)
  const active = useRef(false)
  const id = useRef<string | null>(null)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (lock.current || complete) return
    setError('')
    try { validateInterview(input) } catch (reason) { setError(errorMessage(reason)); return }
    lock.current = true
    setPending(true)
    try {
      if (!navigator.onLine) throw new Error('네트워크 연결을 확인한 후 다시 시도해주세요.')
      id.current ??= newInterviewId()
      await createInterviewQuestion(id.current, userId, input)
      if (active.current) setComplete(true)
    } catch (reason) {
      if (active.current) setError(errorMessage(reason))
    } finally {
      lock.current = false
      if (active.current) setPending(false)
    }
  }
  return <>
    <section className="interview-panel" aria-labelledby="interview-form-heading">
      <h2 id="interview-form-heading">새 면접 질문</h2>
      <form onSubmit={submit} noValidate>
        <fieldset disabled={pending || complete}>
          <label htmlFor="interview-question">질문 *</label>
          <textarea id="interview-question" rows={3} required maxLength={300} value={input.question} onChange={(e) => setInput({ ...input, question: e.target.value })} placeholder="예: 클로저란 무엇인가요?" aria-describedby="interview-question-help" />
          <p id="interview-question-help" className="interview-help">질문은 1~300자로 입력해주세요.</p>
          <label htmlFor="interview-answer">답변 (선택)</label>
          <textarea id="interview-answer" rows={9} maxLength={10000} value={input.answer} onChange={(e) => setInput({ ...input, answer: e.target.value })} placeholder="아직 답변을 몰라도 질문부터 저장할 수 있어요." aria-describedby="interview-answer-help" />
          <p id="interview-answer-help" className="interview-help">답변은 최대 10,000자까지 입력할 수 있습니다.</p>
          <label htmlFor="interview-tags">태그 (선택)</label>
          <input id="interview-tags" value={input.tags} onChange={(e) => setInput({ ...input, tags: e.target.value })} placeholder="JavaScript, React, CS" aria-describedby="interview-tags-help" />
          <p id="interview-tags-help" className="interview-help">쉼표로 구분해주세요. 태그당 30자, 최대 10개까지 저장됩니다.</p>
          <div className="interview-actions"><button className="interview-primary" type="submit">{pending ? '저장 중…' : '질문 저장'}</button><button type="button" onClick={() => setCancel(true)}>취소</button></div>
        </fieldset>
      </form>
      <p className="interview-error" role="alert">{error}</p>
      <p role="status">{pending ? '저장하고 있습니다. 연결이 끊겼다면 다시 연결될 때까지 기다려주세요.' : ''}</p>
    </section>
    <ConfirmModal open={cancel} title="작성 취소" message="작성을 취소하고 목록으로 돌아갈까요? 작성 중인 내용은 저장되지 않습니다." confirmLabel="나가기" onClose={() => setCancel(false)} onConfirm={() => window.location.assign('/interview')} />
    <CompleteModal open={complete} message="면접 질문이 저장되었습니다." confirmLabel="질문 보러가기" onClose={() => window.location.assign('/interview?question=' + encodeURIComponent(id.current!))} />
  </>
}
function InterviewRecords({ userId, questionId }: { userId: string; questionId: string | null }) {
  const [records, setRecords] = useState<InterviewQuestion[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let active = true
    const request = questionId !== null
      ? fetchInterviewQuestion(userId, questionId).then((item) => item ? [item] : [])
      : fetchInterviewQuestions(userId)
    request.then((items) => {
      if (active) { setRecords(items); setError(''); setLoading(false) }
    }).catch((reason: unknown) => {
      if (active) { setError(errorMessage(reason)); setLoading(false) }
    })
    return () => { active = false }
  }, [userId, questionId, retry])
  useEffect(() => {
    const restore = (event: PageTransitionEvent) => {
      if (event.persisted) { setLoading(true); setError(''); setRetry((value) => value + 1) }
    }
    window.addEventListener('pageshow', restore)
    return () => window.removeEventListener('pageshow', restore)
  }, [])
  if (loading) return <section className="interview-panel"><p role="status">면접 질문을 불러오고 있습니다.</p></section>
  if (error) return <section className="interview-panel"><p role="alert" className="interview-error">{error}</p><button type="button" onClick={() => { setLoading(true); setError(''); setRetry((value) => value + 1) }}>다시 불러오기</button></section>
  if (questionId !== null) {
    const detail = records[0]
    if (!detail) return <section className="interview-panel"><h2>면접 질문을 찾을 수 없습니다.</h2><p>질문이 없거나 접근할 수 없는 기록입니다.</p><a href="/interview">목록으로 돌아가기</a></section>
    return <article className="interview-panel" aria-labelledby="interview-detail-heading">
      <h2 id="interview-detail-heading" className="interview-question">{detail.question}</h2>
      <p className="interview-help">등록일 · {detail.createdAt?.toDate().toLocaleDateString('ko-KR') ?? '확인 중'}</p>
      <Tags tags={detail.tags} />
      <h3>답변</h3><p className="interview-answer">{detail.answer || '아직 작성한 답변이 없습니다.'}</p>
    </article>
  }
  return <section className="interview-panel" aria-label="면접 질문 목록">
    <h2>내 질문 <span className="interview-count">{records.length}개</span></h2>
    {records.length === 0 ? <div className="interview-empty"><p>아직 등록한 면접 질문이 없어요.</p><a href="/interview?new=1">첫 질문 등록하기</a></div>
      : <ul className="interview-list">{records.map((item) => <li key={item.id}><a href={'/interview?question=' + encodeURIComponent(item.id)}>
        <strong className="interview-question">{item.question}</strong>
        <span className="interview-help">{item.createdAt?.toDate().toLocaleDateString('ko-KR') ?? '날짜 확인 중'} · {item.answer ? '답변 작성됨' : '답변 미작성'}</span>
        <Tags tags={item.tags} />
      </a></li>)}</ul>}
  </section>
}
export default function InterviewPage() {
  const { user, isLoading, error } = useAuth()
  const params = new URLSearchParams(window.location.search)
  const questionId = params.get('question')
  const form = questionId === null && params.get('new') === '1'
  if (error) return <p role="alert">{error}</p>
  if (isLoading) return <p role="status">로그인 상태를 확인하고 있습니다.</p>
  if (!user) return <p>로그인이 필요합니다. <a href="/login">로그인</a></p>
  return <section className="interview-page" aria-labelledby="interview-heading">
    <header><p className="interview-eyebrow">INTERVIEW</p><div className="interview-heading-row"><h1 id="interview-heading">면접 준비</h1>{!form && questionId === null && <a className="interview-new" href="/interview?new=1">새 면접 질문</a>}</div><p className="interview-help">기억하고 싶은 질문과 답변을 한곳에 모아보세요.</p></header>
    {questionId !== null && <a className="interview-back" href="/interview">← 목록으로</a>}
    {form ? <InterviewForm key={user.uid} userId={user.uid} /> : <InterviewRecords key={`${user.uid}:${questionId ?? 'list'}`} userId={user.uid} questionId={questionId} />}
  </section>
}
