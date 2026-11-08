import { deleteDoc, doc, getDocFromServer, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from './firestore'
import { validateStudyDate } from './studyAnalytics'

export const DAILY_NOTE_LIMIT = 200
export const singleLine = (text: string) => text.replace(/[\r\n\u2028\u2029]+/g, ' ')

const noteRef = (userId: string, date: string) => doc(db, 'users', userId, 'dailyNotes', date)

export async function fetchDailyNote(userId: string, date: string): Promise<string> {
  const snapshot = await getDocFromServer(noteRef(userId, date))
  if (!snapshot.exists()) return ''
  const text: unknown = snapshot.data().text
  if (typeof text !== 'string' || !text.trim()) throw new Error('저장된 한 줄 기록을 확인하지 못했습니다.')
  return text
}

export async function saveDailyNote(userId: string, date: string, input: string) {
  validateStudyDate(date)
  const text = singleLine(input).trim()
  if (!text || text.length > DAILY_NOTE_LIMIT) throw new Error('한 줄 기록은 1~200자로 입력해주세요.')
  await setDoc(noteRef(userId, date), { date, text, updatedAt: serverTimestamp() })
}

export async function deleteDailyNote(userId: string, date: string) {
  await deleteDoc(noteRef(userId, date))
}
