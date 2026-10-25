import { useState } from 'react'
import { useToday } from '../hooks/useToday'
import { filterInterviewQuestions, type InterviewFilters } from '../lib/interviewReview'
import { interviewStatuses } from '../lib/interviewQuestions'
import { useInterviewRecords } from '../hooks/useInterviewRecords'
import InterviewForm from './InterviewForm'
import InterviewDetail from './InterviewDetail'
import InterviewPageList from './InterviewPageList'

export default function InterviewRecords({ userId, questionId, editing = false }: { userId: string; questionId: string | null; editing?: boolean }) {
  const { record, overview: records, loading, error, revision: retry, reload } = useInterviewRecords(userId, questionId)
  const [filters, setFilters] = useState<InterviewFilters>({ status: '', tag: '', reviewOnly: false })
  const today = useToday()
  if (loading) return <section className="interview-panel"><p role="status">면접 질문을 불러오고 있습니다.</p></section>
  if (error) return <section className="interview-panel"><p role="alert" className="interview-error">{error}</p><button type="button" onClick={reload}>다시 불러오기</button></section>
  if (questionId !== null) {
    const detail = record
    if (!detail) return <section className="interview-panel"><h2>면접 질문을 찾을 수 없습니다.</h2><p>질문이 없거나 접근할 수 없는 기록입니다.</p><a href="/interview">목록으로 돌아가기</a></section>
    return editing ? <InterviewForm key={detail.id} userId={userId} record={detail} /> : <InterviewDetail key={detail.id} record={detail} />
  }
  const visible = filterInterviewQuestions(records, filters, new Date(today + 'T12:00:00'))
  const tags = [...new Set(records.flatMap(record => record.tags))].sort((a, b) => a.localeCompare(b))
  return <section className="interview-panel" aria-label="면접 질문 목록">
    <h2>내 질문 <span className="interview-count">{records.length}개</span></h2>
    <div className="interview-filters">
      <div><label htmlFor="interview-status-filter">이해 상태 필터</label><select id="interview-status-filter" value={filters.status} onChange={event => setFilters({ ...filters, status: event.target.value as InterviewFilters['status'] })}><option value="">전체 상태</option>{Object.entries(interviewStatuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
      <div><label htmlFor="interview-tag-filter">태그 필터</label><select id="interview-tag-filter" value={filters.tag} onChange={event => setFilters({ ...filters, tag: event.target.value })}><option value="">전체 태그</option>{[...new Set([...tags, ...(filters.tag ? [filters.tag] : [])])].map(tag => <option key={tag} value={tag}>{tag}</option>)}</select></div>
      <label className="interview-review-toggle"><input type="checkbox" checked={filters.reviewOnly} onChange={event => setFilters({ ...filters, reviewOnly: event.target.checked })} />복습 대상만 보기</label>
      <button type="button" disabled={!filters.status && !filters.tag && !filters.reviewOnly} onClick={() => setFilters({ status: '', tag: '', reviewOnly: false })}>필터 초기화</button>
    </div>
    <p role="status">전체 {records.length}개 · 조건 일치 {visible.length}개</p>
    {records.length === 0 ? <div className="interview-empty"><p>아직 등록한 면접 질문이 없어요.</p><a href="/interview?new=1">첫 질문 등록하기</a></div>
      : visible.length === 0 ? <p className="interview-empty">조건에 맞는 질문이 없습니다. 필터를 변경하거나 초기화해주세요.</p>
      : <InterviewPageList key={JSON.stringify([userId, filters, today, retry])} userId={userId} filters={filters} today={today} overview={records} />}
  </section>
}
