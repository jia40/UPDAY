import { FirebaseError } from 'firebase/app'
import { Timestamp } from 'firebase/firestore'
import { auth } from './firebase'
import { db } from './firestore'
import { needsInterviewReview } from './interviewReview'
import type { InterviewStatus } from './interviewQuestions'

type Field = { stringValue?: string; timestampValue?: string; nullValue?: unknown }
async function fetchSummary(userId: string, collectionId: string, fields: string[]) {
  const user = auth.currentUser
  if (!user || user.uid !== userId) throw new FirebaseError('permission-denied', '로그인 상태를 확인해주세요.')
  const endpoint = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(db.app.options.projectId!)}/databases/(default)/documents:runQuery`
  const request = async (refresh: boolean) => fetch(endpoint, {
    method: 'POST', headers: { Authorization: `Bearer ${await user.getIdToken(refresh)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ structuredQuery: {
      from: [{ collectionId }], select: { fields: fields.map(fieldPath => ({ fieldPath })) },
      where: { fieldFilter: { field: { fieldPath: 'userId' }, op: 'EQUAL', value: { stringValue: userId } } },
    } }),
  })
  let response = await request(false)
  if (response.status === 401) response = await request(true)
  if (!response.ok) throw new FirebaseError(response.status === 401 || response.status === 403 ? 'permission-denied' : 'unavailable', '집계를 불러오지 못했습니다.')
  const rows: { document?: { fields: Record<string, Field> }; error?: unknown }[] = await response.json()
  if (!Array.isArray(rows) || rows.some(row => row.error)) throw new Error('집계 응답을 확인하지 못했습니다.')
  return rows.flatMap(row => row.document ? [row.document.fields] : [])
}
export async function fetchInterviewStats(userId: string, date: string) {
  const rows = await fetchSummary(userId, 'interviewQuestions', ['status', 'lastReviewedAt'])
  const today = new Date(date + 'T12:00:00')
  return rows.filter(fields => {
    const status = fields.status?.stringValue
    if (!status || !['unknown', 'learning', 'explainable'].includes(status)) throw new Error('질문 상태를 확인하지 못했습니다.')
    const reviewed = fields.lastReviewedAt
    if (!reviewed || (!('nullValue' in reviewed) && !reviewed.timestampValue)) throw new Error('복습일을 확인하지 못했습니다.')
    return needsInterviewReview({ status: status as InterviewStatus, lastReviewedAt: reviewed.timestampValue ? Timestamp.fromDate(new Date(reviewed.timestampValue)) : null }, today)
  }).length
}
export type JobStats = { applied: number; screening: number; interview: number }
export async function fetchJobStats(userId: string): Promise<JobStats> {
  const rows = await fetchSummary(userId, 'applications', ['status'])
  const stats = { applied: 0, screening: 0, interview: 0 }
  for (const fields of rows) {
    const status = fields.status?.stringValue
    if (!status || !['interested', 'planned', 'applied', 'screening', 'coding', 'interview', 'accepted', 'rejected'].includes(status)) throw new Error('지원 상태를 확인하지 못했습니다.')
    if (!['interested', 'planned'].includes(status)) stats.applied++
    if (status === 'screening') stats.screening++
    if (status === 'interview') stats.interview++
  }
  return stats
}
