import { collection, deleteDoc, doc, documentId, getDocsFromServer, limit, query, serverTimestamp, setDoc, updateDoc, where, type Timestamp } from 'firebase/firestore'
import { db } from './firebase'

export type InterviewInput = { question: string; answer: string; tags: string }
export type InterviewStatus = 'unknown' | 'learning' | 'explainable'
export const interviewStatuses: Record<InterviewStatus, string> = { unknown: '모름', learning: '이해 중', explainable: '설명 가능' }
export type InterviewQuestion = {
  id: string; userId: string; question: string; answer: string; tags: string[]
  status: InterviewStatus; lastReviewedAt: Timestamp | null; createdAt: Timestamp
}
export function validateInterview(input: InterviewInput) {
  const question = input.question.trim()
  const answer = input.answer.trim()
  const tags = [...new Set(input.tags.split(',').map((tag) => tag.trim()).filter(Boolean))]
  if (!question || question.length > 300) throw new Error('질문은 1~300자로 입력해주세요.')
  if (answer.length > 10000) throw new Error('답변은 10,000자 이내로 입력해주세요.')
  if (tags.length > 10 || tags.some((tag) => tag.length > 30)) throw new Error('태그는 각각 30자 이내로 최대 10개까지 입력해주세요.')
  return { question, answer, tags }
}
export function newInterviewId() { return doc(collection(db, 'interviewQuestions')).id }
export function updateInterviewQuestion(id: string, input: InterviewInput) {
  return updateDoc(doc(db, 'interviewQuestions', id), validateInterview(input))
}
export function deleteInterviewQuestion(id: string) { return deleteDoc(doc(db, 'interviewQuestions', id)) }
export function updateInterviewStatus(id: string, status: InterviewStatus) {
  if (!Object.hasOwn(interviewStatuses, status)) throw new Error('올바른 이해 상태를 선택해주세요.')
  return updateDoc(doc(db, 'interviewQuestions', id), { status })
}
export function reviewInterviewQuestion(id: string) {
  return updateDoc(doc(db, 'interviewQuestions', id), { lastReviewedAt: serverTimestamp() })
}
export async function createInterviewQuestion(id: string, userId: string, input: InterviewInput) {
  const values = validateInterview(input)
  try {
    await setDoc(doc(db, 'interviewQuestions', id), {
      ...values, userId, status: 'unknown', lastReviewedAt: null, createdAt: serverTimestamp(),
    })
  } catch (reason) {
    // The server may have committed before the acknowledgement was lost.
    // Keep the same ID and reconcile instead of creating a duplicate on retry.
    let saved: InterviewQuestion | null = null
    try { saved = await fetchInterviewQuestion(userId, id) } catch { /* Preserve the original save error. */ }
    if (saved && saved.question === values.question && saved.answer === values.answer && JSON.stringify(saved.tags) === JSON.stringify(values.tags)) return
    if (saved) throw new Error('이 질문은 이미 저장되어 있습니다. 목록에서 저장된 내용을 확인해주세요.', { cause: reason })
    throw reason
  }
}
export async function fetchInterviewQuestions(userId: string) {
  const snapshot = await getDocsFromServer(query(collection(db, 'interviewQuestions'), where('userId', '==', userId)))
  return snapshot.docs.map((item) => ({ ...item.data(), id: item.id }) as InterviewQuestion)
    .sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0) || a.id.localeCompare(b.id))
}
export async function fetchInterviewQuestion(userId: string, id: string) {
  if (!id || id.includes('/')) return null
  // Include ownership in the query so missing and inaccessible records both
  // produce the same empty result, without downloading the entire collection.
  const snapshot = await getDocsFromServer(query(collection(db, 'interviewQuestions'), where('userId', '==', userId), where(documentId(), '==', id), limit(1)))
  const item = snapshot.docs[0]
  return item ? { ...item.data(), id: item.id } as InterviewQuestion : null
}
