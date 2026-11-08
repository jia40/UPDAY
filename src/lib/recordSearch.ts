import { FirebaseError } from 'firebase/app'
import { Timestamp } from 'firebase/firestore'
import { auth } from './firebase'
import { db } from './firestore'
import type { SearchEntry, SearchKind } from './searchPolicy'

const sources = {
  study: { collection: 'studyLogs', text: 'title', fields: ['title', 'studyDate', 'studyMinutes', 'tags', 'createdAt'] },
  interview: { collection: 'interviewQuestions', text: 'question', fields: ['question', 'status', 'tags', 'lastReviewedAt', 'createdAt'] },
  job: { collection: 'applications', text: 'company', fields: ['company', 'position', 'status', 'appliedAt', 'createdAt'] },
}
function timestamp(value?: string): Timestamp {
  const milliseconds = Date.parse(value ?? '')
  if (!Number.isFinite(milliseconds)) throw new Error('검색 기록의 날짜를 확인하지 못했습니다.')
  return new Timestamp(Math.floor(milliseconds / 1000), Number((value!.match(/\.(\d+)Z$/)?.[1] ?? '').padEnd(9, '0')))
}

// Only search/list fields are projected. A UID equality constraint is always
// present; the same Firebase authentication and owner rules apply to REST.
export async function fetchRecordSearchIndex(kind: SearchKind, userId: string): Promise<SearchEntry[]> {
  const user = auth.currentUser
  if (!user || user.uid !== userId) throw new FirebaseError('permission-denied', '로그인 상태를 확인해주세요.')
  const source = sources[kind]
  const project = db.app.options.projectId!
  const endpoint = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(project)}/databases/(default)/documents:runQuery`
  const request = async (refresh: boolean) => fetch(endpoint, {
    method: 'POST', headers: { Authorization: `Bearer ${await user.getIdToken(refresh)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ structuredQuery: {
      from: [{ collectionId: source.collection }], select: { fields: source.fields.map(fieldPath => ({ fieldPath })) },
      where: { fieldFilter: { field: { fieldPath: 'userId' }, op: 'EQUAL', value: { stringValue: userId } } },
    } }),
  })
  let response = await request(false)
  if (response.status === 401) response = await request(true)
  if (auth.currentUser !== user) throw new FirebaseError('permission-denied', '로그인 상태가 변경되었습니다.')
  if (!response.ok) throw new FirebaseError(response.status === 401 || response.status === 403 ? 'permission-denied' : 'unavailable', '검색 정보를 불러오지 못했습니다. 다시 시도해주세요.')
  type Value = { stringValue?: string; integerValue?: string; timestampValue?: string; arrayValue?: { values?: Value[] } }
  const rows: { document?: { name: string; fields: Record<string, Value> }; error?: unknown }[] = await response.json()
  if (auth.currentUser !== user) throw new FirebaseError('permission-denied', '로그인 상태가 변경되었습니다.')
  if (!Array.isArray(rows) || rows.some(row => row.error)) throw new Error('검색 응답을 확인하지 못했습니다.')
  const prefix = `projects/${project}/databases/(default)/documents/${source.collection}/`
  return rows.flatMap(({ document }) => {
    if (!document) return []
    const data = document.fields
    if (!document.name.startsWith(prefix) || typeof data[source.text]?.stringValue !== 'string') throw new Error('검색 기록을 확인하지 못했습니다.')
    const studyMinutes = Number(data.studyMinutes?.integerValue ?? 0)
    if (kind === 'study' && (!Number.isInteger(studyMinutes) || studyMinutes < 1 || studyMinutes > 1440)) throw new Error('검색 기록의 학습 시간을 확인하지 못했습니다.')
    return [{ id: document.name.slice(prefix.length), text: data[source.text].stringValue!, createdAt: timestamp(data.createdAt?.timestampValue),
      tags: (data.tags?.arrayValue?.values ?? []).flatMap(value => typeof value.stringValue === 'string' ? [value.stringValue] : []),
      status: data.status?.stringValue ?? '', studyDate: data.studyDate?.stringValue, studyMinutes,
      lastReviewedAt: data.lastReviewedAt?.timestampValue ? timestamp(data.lastReviewedAt.timestampValue) : null,
      position: data.position?.stringValue ?? '', appliedAt: data.appliedAt?.stringValue ?? '' }]
  })
}
