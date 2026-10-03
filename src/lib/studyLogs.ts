import { collection, doc, documentId, getDocsFromServer, query, where, orderBy, limit, startAfter, setDoc, updateDoc, deleteDoc, serverTimestamp, Timestamp, type QueryDocumentSnapshot } from 'firebase/firestore'
import { FirebaseError } from 'firebase/app'
import { auth, db } from './firebase'
import { effectiveStudyDate, validateStudyDate } from './studyAnalytics'

export type StudyInput = { title: string; content: string; tags: string; studyMinutes: string; studyDate: string }
export type StudyLog = { id: string; userId: string; title: string; content: string; tags: string[]; studyMinutes: number; studyDate?: string; createdAt: Timestamp }
export type StudySummary = Pick<StudyLog, 'id' | 'studyDate' | 'createdAt' | 'studyMinutes' | 'tags'>
export type StudyPageCursor = QueryDocumentSnapshot
export const STUDY_PAGE_SIZE = 20

export async function fetchStudyLog(userId: string, id: string): Promise<StudyLog | null> {
  if (!id || id.includes('/')) return null
  try {
    const snapshot = await getDocsFromServer(query(collection(db, 'studyLogs'), where('userId', '==', userId), where(documentId(), '==', id), limit(1)))
    const item = snapshot.docs[0]
    return item ? { ...item.data(), id: item.id } as StudyLog : null
  } catch (error) {
    // Owner-only rules can deny a missing ID as well as someone else's ID.
    // Show the same unavailable state without revealing another user's records.
    if ((error as { code?: string })?.code === 'permission-denied') return null
    throw error
  }
}

export async function fetchStudyPage(userId: string, date: string | null, tag: string, cursor?: StudyPageCursor) {
  const constraints = [where('userId', '==', userId)]
  if (date) constraints.push(where('studyDate', '==', date))
  if (tag) constraints.push(where('tags', 'array-contains', tag))
  const snapshot = await getDocsFromServer(query(collection(db, 'studyLogs'), ...constraints,
    orderBy('studyDate', 'desc'), orderBy('createdAt', 'desc'), orderBy(documentId(), 'asc'),
    ...(cursor ? [startAfter(cursor)] : []), limit(STUDY_PAGE_SIZE + 1)))
  const docs = snapshot.docs.slice(0, STUDY_PAGE_SIZE)
  return {
    items: docs.map(item => ({ ...item.data(), id: item.id }) as StudyLog),
    cursor: docs.at(-1), hasMore: snapshot.docs.length > STUDY_PAGE_SIZE,
  }
}

// The Web SDK has no field projection. REST uses the same Firebase ID token and
// security rules, returning only statistics fields, never titles or full content.
export async function fetchStudyOverview(userId: string): Promise<StudySummary[]> {
  const user = auth.currentUser
  if (!user || user.uid !== userId) throw new FirebaseError('permission-denied', '로그인 상태를 확인해주세요.')
  const endpoint = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(db.app.options.projectId!)}/databases/(default)/documents:runQuery`
  const request = async (refresh: boolean) => fetch(endpoint, {
    method: 'POST', headers: { Authorization: `Bearer ${await user.getIdToken(refresh)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ structuredQuery: {
      from: [{ collectionId: 'studyLogs' }],
      select: { fields: ['studyDate', 'createdAt', 'studyMinutes', 'tags'].map(fieldPath => ({ fieldPath })) },
      where: { fieldFilter: { field: { fieldPath: 'userId' }, op: 'EQUAL', value: { stringValue: userId } } },
    } }),
  })
  let response = await request(false)
  if (response.status === 401) response = await request(true)
  if (!response.ok) throw new FirebaseError(response.status === 403 || response.status === 401 ? 'permission-denied' : 'unavailable', '학습 통계를 불러오지 못했습니다.')
  type Value = { stringValue?: string; timestampValue?: string; integerValue?: string; arrayValue?: { values?: Value[] } }
  const rows: { document?: { name: string; fields: Record<string, Value> } }[] = await response.json()
  return rows.flatMap(({ document }) => {
    if (!document) return []
    const data = document.fields
    return [{ id: document.name.split('/').at(-1)!, studyDate: data.studyDate?.stringValue,
      createdAt: Timestamp.fromDate(new Date(data.createdAt.timestampValue!)),
      studyMinutes: Number(data.studyMinutes.integerValue), tags: (data.tags?.arrayValue?.values ?? []).map(value => value.stringValue!) }]
  })
}
export function validateStudy(input: StudyInput) {
  const title = input.title.trim()
  const content = input.content.trim()
  const tags = [...new Set(input.tags.split(',').map((tag) => tag.trim()).filter(Boolean))]
  const studyMinutes = Number(input.studyMinutes)
  if (!title || title.length > 100) throw new Error('제목은 1~100자로 입력해주세요.')
  if (!content || content.length > 10000) throw new Error('학습 내용은 1~10,000자로 입력해주세요.')
  if (!Number.isInteger(studyMinutes) || studyMinutes < 1 || studyMinutes > 1440) throw new Error('학습 시간은 1~1,440분의 정수로 입력해주세요.')
  if (tags.length > 10 || tags.some((tag) => tag.length > 30)) throw new Error('태그는 각각 30자 이내로 최대 10개까지 입력해주세요.')
  const studyDate = validateStudyDate(input.studyDate)
  return { title, content, tags, studyMinutes, studyDate }
}
export async function fetchStudyLogs(userId: string) {
  const snapshot = await getDocsFromServer(query(collection(db, 'studyLogs'), where('userId', '==', userId)))
  return snapshot.docs.map((item) => ({ ...item.data(), id: item.id }) as StudyLog)
    .sort((a, b) => (effectiveStudyDate(b) ?? '').localeCompare(effectiveStudyDate(a) ?? '')
      || (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0) || a.id.localeCompare(b.id))
}
export function newStudyId() { return doc(collection(db, 'studyLogs')).id }
export function createStudyLog(id: string, userId: string, input: StudyInput) {
  return setDoc(doc(db, 'studyLogs', id), { ...validateStudy(input), userId, createdAt: serverTimestamp() })
}
export function updateStudyLog(id: string, input: StudyInput) {
  return updateDoc(doc(db, 'studyLogs', id), validateStudy(input))
}
export function deleteStudyLog(id: string) { return deleteDoc(doc(db, 'studyLogs', id)) }
