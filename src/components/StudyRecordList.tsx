import { useEffect, useRef, useState } from 'react'
import { fetchStudyPage, type StudyLog, type StudyPageCursor } from '../lib/studyLogs'
import { effectiveStudyDate, formatStudyTime } from '../lib/studyAnalytics'

export default function StudyRecordList({ userId, date, tag }: { userId: string; date: string | null; tag: string }) {
  const [items, setItems] = useState<StudyLog[]>([])
  const [cursor, setCursor] = useState<StudyPageCursor>()
  const [hasMore, setHasMore] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const active = useRef(false)
  const busy = useRef(false)
  useEffect(() => {
    active.current = true
    let cancelled = false
    fetchStudyPage(userId, date, tag).then(page => {
      if (!cancelled) { setItems(page.items); setCursor(page.cursor); setHasMore(page.hasMore); setError('') }
    }).catch(() => {
      if (!cancelled) setError('학습 기록을 불러오지 못했습니다. 다시 시도해주세요.')
    }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true; active.current = false }
  }, [userId, date, tag, retry])

  async function loadMore() {
    if (busy.current || loading || !hasMore) return
    busy.current = true
    setLoading(true); setError('')
    try {
      const page = await fetchStudyPage(userId, date, tag, cursor)
      if (active.current) {
        setItems(previous => [...previous, ...page.items.filter(item => !previous.some(existing => existing.id === item.id))])
        setCursor(page.cursor); setHasMore(page.hasMore)
      }
    } catch {
      if (active.current) setError('학습 기록을 불러오지 못했습니다. 다시 시도해주세요.')
    } finally {
      busy.current = false
      if (active.current) setLoading(false)
    }
  }
  return <>
    {items.length > 0 && <ul className="study-list">{items.map(log => <li key={log.id}>
      <a className="study-record" href={`/study?record=${encodeURIComponent(log.id)}`}>
        <strong>{log.title}</strong><span>{effectiveStudyDate(log) ?? '날짜 없음'} · {formatStudyTime(log.studyMinutes)}</span>
        {log.tags.length > 0 && <span className="study-tags">{log.tags.map(value => <span key={value}>{value}</span>)}</span>}
      </a>
    </li>)}</ul>}
    {loading && <p role="status">학습 기록을 불러오고 있습니다.</p>}
    {error && <div role="alert"><p>{error}</p><button type="button" disabled={loading} onClick={() => {
      if (items.length) void loadMore()
      else { setLoading(true); setError(''); setRetry(value => value + 1) }
    }}>목록 다시 불러오기</button></div>}
    {!loading && !error && items.length === 0 && <p className="study-empty">{date || tag ? '선택한 조건에 맞는 학습 기록이 없어요. 필터를 해제해보세요.' : '아직 학습 기록이 없어요. 오늘 배운 내용을 남겨보세요.'}</p>}
    {!error && hasMore && items.length > 0 && <button className="study-primary" type="button" disabled={loading} onClick={() => void loadMore()}>{loading ? '불러오는 중…' : '더 보기'}</button>}
  </>
}
