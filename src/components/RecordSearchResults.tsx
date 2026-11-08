import { useCallback, useState } from 'react'
import { fetchRecordSearchIndex } from '../lib/recordSearch'
import { searchRecords, type SearchEntry } from '../lib/searchPolicy'
import { effectiveStudyDate, formatStudyTime } from '../lib/studyAnalytics'
import { useRefreshTask } from '../hooks/useRefreshTask'
import { usePageRefresh } from '../hooks/usePageRefresh'
import type { SearchProps } from './RecordSearch'

function Pages({ entries, ...props }: SearchProps & { entries: SearchEntry[] }) {
  const [limit, setLimit] = useState(20)
  const matches = searchRecords(props.kind, entries, props.query, props.filters)
  const visible = matches.slice(0, limit)
  const path = props.kind === 'study' ? '/study?record=' : props.kind === 'interview' ? '/interview?question=' : '/job?application='
  return <>
    <p role="status">검색어: {props.query} · 검색 결과 {matches.length}개 · 현재 {visible.length}개 표시</p>
    {!matches.length && <p>검색 조건에 맞는 기록이 없습니다.</p>}
    <ul className={`${props.kind}-list record-search-results`}>{visible.map(entry => <li key={entry.id}><a className={props.kind === 'study' ? 'study-record' : undefined} href={path + encodeURIComponent(entry.id)}>
      <strong>{entry.text}</strong>
      {props.kind === 'study' ? <span>{effectiveStudyDate(entry) ?? '날짜 없음'} · {formatStudyTime(entry.studyMinutes)}</span>
        : <><span>{props.statusLabels?.[entry.status] ?? entry.status}{props.kind === 'job' && ` · ${entry.position} · ${entry.appliedAt || '지원일 미입력'}`}</span>
          {props.kind === 'interview' && <span>마지막 복습 · {entry.lastReviewedAt?.toDate().toLocaleDateString('ko-KR') ?? '아직 복습하지 않았습니다.'}</span>}</>}
      {entry.tags.length > 0 && <span>{entry.tags.join(' · ')}</span>}
    </a></li>)}</ul>
    {visible.length < matches.length && <button type="button" onClick={() => setLimit(value => value + 20)}>더 보기</button>}
  </>
}
function SearchData(props: SearchProps) {
  const [entries, setEntries] = useState<SearchEntry[] | null>(null)
  const [error, setError] = useState('')
  const [pending, setPending] = useState(true)
  const load = useCallback(async (current: () => boolean) => {
    setPending(true)
    try {
      const records = await fetchRecordSearchIndex(props.kind, props.userId)
      if (current()) { setEntries(records); setError('') }
    } catch (reason) { if (current()) setError(reason instanceof Error ? reason.message : '검색 정보를 불러오지 못했습니다.') }
    finally { if (current()) setPending(false) }
  }, [props.kind, props.userId])
  const task = useRefreshTask(load)
  usePageRefresh(task.request)
  return <>
    {pending && <p role="status">검색 정보를 불러오고 있습니다.</p>}
    {error && <div role="alert"><p>{error}</p><button type="button" disabled={pending} onClick={() => void task.request()}>검색 다시 불러오기</button></div>}
    {!pending && !error && entries && <Pages key={JSON.stringify([props.query, props.filters])} {...props} entries={entries} />}
  </>
}
export default function RecordSearchResults(props: SearchProps) {
  return <SearchData key={`${props.kind}:${props.userId}`} {...props} />
}
