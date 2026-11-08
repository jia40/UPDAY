import { lazy, Suspense, useId, type Dispatch, type SetStateAction } from 'react'
import type { SearchFilters, SearchKind } from '../lib/searchPolicy'

export type SearchProps = { kind: SearchKind; userId: string; query: string; filters: SearchFilters; statusLabels?: Record<string, string> }
const Results = lazy(() => import('./RecordSearchResults'))
export function SearchResults(props: SearchProps) {
  return <Suspense fallback={<p role="status">검색 정보를 불러오고 있습니다.</p>}><Results {...props} /></Suspense>
}
type SearchInput = { draft: string; query: string }
export function SearchForm({ label, value, onChange }: { label: string; value: SearchInput; onChange: Dispatch<SetStateAction<SearchInput>> }) {
  const id = useId()
  return <form className="record-search" role="search" aria-label={`${label} 검색`} onSubmit={event => { event.preventDefault(); onChange(previous => ({ ...previous, query: previous.draft.trim() })) }}>
    <label htmlFor={id}>{label} 검색</label>
    <div className="record-search__row"><input id={id} type="search" value={value.draft} maxLength={300} onChange={event => { const draft = event.target.value; onChange(previous => ({ ...previous, draft })) }} placeholder={`${label} 검색어 입력`} />
      <button type="submit">검색</button><button type="button" onClick={() => onChange({ draft: '', query: '' })}>검색어 초기화</button></div>
  </form>
}
