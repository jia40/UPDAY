import { FirebaseError } from 'firebase/app'
import { Timestamp } from 'firebase/firestore'
import { auth, db } from './firebase'
import type { InterviewQuestion } from './interviewQuestions'
import { filterInterviewQuestions, type InterviewFilters } from './interviewReview'

export type InterviewMetadata = Pick<InterviewQuestion, 'id' | 'tags' | 'status' | 'lastReviewedAt' | 'createdAt'>
export type InterviewListItem = InterviewMetadata & Pick<InterviewQuestion, 'question'>
export type InterviewCursor = { id: string; createdAt: Timestamp }
export const INTERVIEW_PAGE_SIZE = 20
function timestamp(value: string) {
  const milliseconds = Date.parse(value)
  if (!Number.isFinite(milliseconds)) throw new Error('질문 날짜를 확인하지 못했습니다.')
  const nanos = Number((value.match(/\.(\d+)Z$/)?.[1] ?? '').padEnd(9, '0'))
  return new Timestamp(Math.floor(milliseconds / 1000), nanos)
}
// REST projection avoids downloading answers while using the same owner rules.
async function run(userId: string, structuredQuery: Record<string, unknown>) {
  const user = auth.currentUser
  if (!user || user.uid !== userId) throw new FirebaseError('permission-denied', '로그인 상태를 확인해주세요.')
  const endpoint = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(db.app.options.projectId!)}/databases/(default)/documents:runQuery`
  const request = async (refresh: boolean) => fetch(endpoint, { method: 'POST', headers: { Authorization: `Bearer ${await user.getIdToken(refresh)}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ structuredQuery }) })
  let response = await request(false)
  if (response.status === 401) response = await request(true)
  if (!response.ok) throw new FirebaseError(response.status === 401 || response.status === 403 ? 'permission-denied' : response.status === 400 ? 'failed-precondition' : 'unavailable', '질문 목록을 불러오지 못했습니다. 인덱스와 연결 상태를 확인해주세요.')
  type Value = { stringValue?: string; timestampValue?: string; arrayValue?: { values?: Value[] } }
  const rows: { document?: { name: string; fields: Record<string, Value> }; error?: unknown }[] = await response.json()
  if (!Array.isArray(rows) || rows.some(row => row.error)) throw new Error('질문 목록 응답을 확인하지 못했습니다.')
  return rows.flatMap(row => {
    if (!row.document) return []
    const { name, fields } = row.document
    return [{ id: name.split('/').at(-1)!, question: fields.question?.stringValue ?? '', status: fields.status.stringValue as InterviewQuestion['status'],
      tags: (fields.tags?.arrayValue?.values ?? []).map(value => value.stringValue!),
      createdAt: timestamp(fields.createdAt.timestampValue!),
      lastReviewedAt: fields.lastReviewedAt?.timestampValue ? timestamp(fields.lastReviewedAt.timestampValue) : null }]
  })
}
const field = (name: string, op: string, value: unknown) => ({ fieldFilter: { field: { fieldPath: name }, op, value } })
const select = (names: string[]) => ({ fields: names.map(fieldPath => ({ fieldPath })) })
export async function fetchInterviewOverview(userId: string): Promise<InterviewMetadata[]> {
  return run(userId, { from: [{ collectionId: 'interviewQuestions' }], select: select(['tags', 'status', 'lastReviewedAt', 'createdAt']), where: field('userId', 'EQUAL', { stringValue: userId }) })
}
export async function fetchInterviewPage(userId: string, filters: InterviewFilters, today: string, cursor?: InterviewCursor, overview?: InterviewMetadata[]) {
  const metadata = overview ?? await fetchInterviewOverview(userId)
  const eligible = filterInterviewQuestions(metadata, filters, new Date(today + 'T12:00:00')).sort((a, b) => b.createdAt.seconds - a.createdAt.seconds || b.createdAt.nanoseconds - a.createdAt.nanoseconds || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const start = cursor ? eligible.findIndex(item => item.id === cursor.id) + 1 : 0
  if (cursor && start === 0) throw new Error('목록이 변경되었습니다. 새로고침해주세요.')
  const candidates = eligible.slice(start, start + INTERVIEW_PAGE_SIZE + 1)
  if (!candidates.length) return { items: [], hasMore: false, cursor: undefined }
  const references = candidates.map(item => ({ referenceValue: `projects/${db.app.options.projectId}/databases/(default)/documents/interviewQuestions/${item.id}` }))
  const rows = await run(userId, { from: [{ collectionId: 'interviewQuestions' }], select: select(['question', 'tags', 'status', 'lastReviewedAt', 'createdAt']),
    where: { compositeFilter: { op: 'AND', filters: [field('userId', 'EQUAL', { stringValue: userId }), field('__name__', 'IN', { arrayValue: { values: references } })] } } })
  const byId = new Map(rows.map(item => [item.id, item]))
  const page = candidates.slice(0, INTERVIEW_PAGE_SIZE)
  // Preserve the metadata cursor even if a selected record was concurrently deleted.
  return { items: page.flatMap(item => { const row = byId.get(item.id); return row && filterInterviewQuestions([row], filters, new Date(today + 'T12:00:00')).length ? [row] : [] }), hasMore: candidates.length > INTERVIEW_PAGE_SIZE, cursor: page.at(-1) }
}
