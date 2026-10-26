import { useInterviewPage } from '../hooks/useInterviewPage'
import type { InterviewMetadata } from '../lib/interviewPagination'
import type { InterviewFilters } from '../lib/interviewReview'
import { interviewStatuses } from '../lib/interviewQuestions'
import Tags from './InterviewTags'
export default function InterviewPageList({ userId, filters, today, overview }: { userId: string; filters: InterviewFilters; today: string; overview: InterviewMetadata[] }) {
  const { items, pending, error, hasMore, load } = useInterviewPage(userId, filters, today, overview)
  return <>
    <p role="status">현재 {items.length}개 표시{pending ? ' · 질문을 불러오고 있습니다.' : ''}</p>
    <ul className="interview-list">{items.map(item => <li key={item.id}><a href={'/interview?question=' + encodeURIComponent(item.id)}>
      <strong className="interview-question">{item.question}</strong>
      <span className="interview-help">{item.createdAt.toDate().toLocaleDateString('ko-KR')} · {interviewStatuses[item.status]}</span>
      <span className="interview-help">마지막 복습 · {item.lastReviewedAt?.toDate().toLocaleDateString('ko-KR') ?? '아직 복습하지 않았습니다.'}</span><Tags tags={item.tags} />
    </a></li>)}</ul>
    {error && <p role="alert" className="interview-error">{error}</p>}
    {(hasMore || error) && <button type="button" disabled={pending} onClick={() => void load()}>{error ? '질문 다시 불러오기' : pending ? '불러오는 중…' : '더 보기'}</button>}
  </>
}
