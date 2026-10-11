import { collection, doc, documentId, getDocsFromServer, query, where, limit, setDoc, updateDoc, deleteDoc, serverTimestamp, type Timestamp } from 'firebase/firestore'
import { db } from './firebase'
import { validateStudyDate } from './studyAnalytics'

export const applicationStatuses = { interested: '관심', planned: '지원 예정', applied: '지원 완료', screening: '서류', coding: '코딩테스트', interview: '면접', accepted: '합격', rejected: '탈락' }
export type ApplicationStatus = keyof typeof applicationStatuses
export type ApplicationInput = { company: string; position: string; url: string; status: ApplicationStatus; appliedAt: string; memo: string }
export type Application = ApplicationInput & { id: string; userId: string; createdAt: Timestamp; updatedAt: Timestamp }
export function validateApplication(input: ApplicationInput): ApplicationInput {
  const values = { ...input, company: input.company.trim(), position: input.position.trim(), url: input.url.trim(), memo: input.memo.trim() }
  if (!values.company || values.company.length > 100) throw new Error('기업명은 1~100자로 입력해주세요.')
  if (!values.position || values.position.length > 100) throw new Error('포지션은 1~100자로 입력해주세요.')
  if (!Object.hasOwn(applicationStatuses, values.status)) throw new Error('올바른 지원 상태를 선택해주세요.')
  if (values.memo.length > 10000) throw new Error('메모는 10,000자 이내로 입력해주세요.')
  if (values.url) {
    let url: URL
    try { url = new URL(values.url) } catch { throw new Error('공고 URL을 확인해주세요.') }
    if (!['http:', 'https:'].includes(url.protocol) || values.url.length > 2000) throw new Error('공고 URL은 2,000자 이내의 HTTP/HTTPS 주소로 입력해주세요.')
  }
  if (values.appliedAt) {
    try { validateStudyDate(values.appliedAt) } catch (cause) { throw new Error('지원일은 오늘 또는 지난 날짜로 선택해주세요.', { cause }) }
  }
  return values
}
export function newApplicationId() { return doc(collection(db, 'applications')).id }
export async function fetchApplications(userId: string) {
  const snapshot = await getDocsFromServer(query(collection(db, 'applications'), where('userId', '==', userId)))
  return snapshot.docs.map(item => ({ ...item.data(), id: item.id }) as Application).sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis() || a.id.localeCompare(b.id))
}
export async function fetchApplication(userId: string, id: string) {
  if (!id || id.includes('/')) return null
  const snapshot = await getDocsFromServer(query(collection(db, 'applications'), where('userId', '==', userId), where(documentId(), '==', id), limit(1)))
  const item = snapshot.docs[0]
  return item ? { ...item.data(), id: item.id } as Application : null
}
export async function createApplication(id: string, userId: string, input: ApplicationInput) {
  const values = validateApplication(input)
  try { await setDoc(doc(db, 'applications', id), { ...values, userId, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }) }
  catch (reason) {
    let saved: Application | null = null
    try { saved = await fetchApplication(userId, id) } catch { /* Keep original error. */ }
    if (saved && Object.entries(values).every(([key, value]) => saved![key as keyof ApplicationInput] === value)) return
    if (saved) throw new Error('이미 저장된 기록입니다. 목록에서 확인해주세요.', { cause: reason })
    throw reason
  }
}
export function updateApplication(id: string, input: ApplicationInput) { return updateDoc(doc(db, 'applications', id), { ...validateApplication(input), updatedAt: serverTimestamp() }) }
export function changeApplicationStatus(id: string, status: ApplicationStatus) {
  if (!Object.hasOwn(applicationStatuses, status)) throw new Error('올바른 지원 상태를 선택해주세요.')
  return updateDoc(doc(db, 'applications', id), { status, updatedAt: serverTimestamp() })
}
export function deleteApplication(id: string) { return deleteDoc(doc(db, 'applications', id)) }
