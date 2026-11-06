import { useState } from 'react'
import { useJobPage } from '../hooks/useJobPage'
import { applicationStatuses } from '../lib/applications'
import StatusOptions from './JobStatusOptions'

function JobRecords({ userId, filter }: { userId: string; filter: string }) {
  const { items, pending, error, hasLoaded, hasMore, loadMore, retry } = useJobPage(userId, filter)
  return <>
    {hasLoaded && <p role="status">현재 조건에서 불러온 지원 기록 {items.length}개{!hasMore && !error ? ' · 마지막 페이지' : ''}</p>}
    {pending && <p role="status">지원 기록을 불러오고 있습니다.</p>}
    {error && <div role="alert"><p>{error}</p><button type="button" disabled={pending} onClick={retry}>다시 불러오기</button></div>}
    {items.length > 0 && <ul className="job-list">{items.map(record => <li key={record.id}>
      <a href={'/job?application=' + encodeURIComponent(record.id)}><strong className="job-question">{record.company}</strong><span className="job-question">{record.position}</span><span className="job-help">{applicationStatuses[record.status]} · {record.appliedAt || '지원일 미입력'}</span></a>
    </li>)}</ul>}
    {!pending && !error && hasLoaded && items.length === 0 && <div className="job-empty"><p>{filter ? '선택한 상태의 기록이 없습니다.' : '아직 등록한 지원 기록이 없습니다.'}</p>{!filter && <a href="/job?new=1">첫 지원 기록 등록하기</a>}</div>}
    {!error && hasMore && <button type="button" className="job-primary" disabled={pending} onClick={loadMore}>더 보기</button>}
  </>
}

export default function JobList({ userId }: { userId: string }) {
  const [filter, setFilter] = useState('')
  return <section className="job-panel" aria-label="지원 기록 목록">
    <h2>내 지원 기록</h2>
    <label htmlFor="job-filter">지원 상태 필터</label><select id="job-filter" value={filter} onChange={event => setFilter(event.target.value)}><option value="">전체</option><StatusOptions /></select>
    <JobRecords key={`${userId}:${filter}`} userId={userId} filter={filter} />
  </section>
}
