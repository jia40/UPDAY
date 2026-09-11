import { collection, doc, getDocsFromServer, query, where, setDoc, updateDoc, deleteDoc, serverTimestamp, type Timestamp } from 'firebase/firestore'
import { db } from './firebase'

export type StudyInput = { title: string; content: string; tags: string; studyMinutes: string }
export type StudyLog = { id: string; userId: string; title: string; content: string; tags: string[]; studyMinutes: number; createdAt: Timestamp }
export function validateStudy(input: StudyInput) {
  const title = input.title.trim()
  const content = input.content.trim()
  const tags = [...new Set(input.tags.split(',').map((tag) => tag.trim()).filter(Boolean))]
  const studyMinutes = Number(input.studyMinutes)
  if (!title || title.length > 100) throw new Error('제목은 1~100자로 입력해주세요.')
  if (!content || content.length > 10000) throw new Error('학습 내용은 1~10,000자로 입력해주세요.')
  if (!Number.isInteger(studyMinutes) || studyMinutes < 1 || studyMinutes > 1440) throw new Error('학습 시간은 1~1,440분의 정수로 입력해주세요.')
  if (tags.length > 10 || tags.some((tag) => tag.length > 30)) throw new Error('태그는 각각 30자 이내로 최대 10개까지 입력해주세요.')
  return { title, content, tags, studyMinutes }
}
export async function fetchStudyLogs(userId: string) {
  const snapshot = await getDocsFromServer(query(collection(db, 'studyLogs'), where('userId', '==', userId)))
  return snapshot.docs.map((item) => ({ ...item.data(), id: item.id }) as StudyLog)
    .sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0) || a.id.localeCompare(b.id))
}
export function newStudyId() { return doc(collection(db, 'studyLogs')).id }
export function createStudyLog(id: string, userId: string, input: StudyInput) {
  return setDoc(doc(db, 'studyLogs', id), { ...validateStudy(input), userId, createdAt: serverTimestamp() })
}
export function updateStudyLog(id: string, input: StudyInput) {
  return updateDoc(doc(db, 'studyLogs', id), validateStudy(input))
}
export function deleteStudyLog(id: string) { return deleteDoc(doc(db, 'studyLogs', id)) }
