import { useAuth } from '../hooks/useAuth'
import InterviewForm from '../components/InterviewForm'
import InterviewRecords from '../components/InterviewRecords'
import '../styles/interview.css'

export default function InterviewPage() {
  const { user, isLoading, error } = useAuth()
  const params = new URLSearchParams(window.location.search)
  const questionId = params.get('question')
  const form = questionId === null && params.get('new') === '1'
  const editing = questionId !== null && params.get('edit') === '1'
  if (error) return <p role="alert">{error}</p>
  if (isLoading) return <p role="status">로그인 상태를 확인하고 있습니다.</p>
  if (!user) return <p>로그인이 필요합니다. <a href="/login">로그인</a></p>
  return <section className="interview-page" aria-labelledby="interview-heading">
    <header><p className="interview-eyebrow">INTERVIEW</p><div className="interview-heading-row"><h1 id="interview-heading">면접 준비</h1>{!form && questionId === null && <a className="interview-new" href="/interview?new=1">새 면접 질문</a>}</div><p className="interview-help">기억하고 싶은 질문과 답변을 한곳에 모아보세요.</p></header>
    {questionId !== null && <a className="interview-back" href="/interview">← 목록으로</a>}
    {form ? <InterviewForm key={user.uid} userId={user.uid} /> : <InterviewRecords key={`${user.uid}:${questionId ?? 'list'}:${editing}`} userId={user.uid} questionId={questionId} editing={editing} />}
  </section>
}
