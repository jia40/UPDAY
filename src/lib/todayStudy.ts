import { collection, getDocsFromServer, query, where } from 'firebase/firestore'
import { db } from './firebase'
import { validateStudyDate } from './studyAnalytics'

export async function fetchDailyStudyMinutes(userId: string, date: string) {
  validateStudyDate(date)
  const snapshot = await getDocsFromServer(query(collection(db, 'studyLogs'), where('userId', '==', userId), where('studyDate', '==', date)))
  return snapshot.docs.reduce((total, item) => {
    const data = item.data()
    if (data.userId !== userId || data.studyDate !== date || !Number.isInteger(data.studyMinutes) || data.studyMinutes < 1 || data.studyMinutes > 1440) throw new Error('학습 시간 데이터를 확인하지 못했습니다.')
    return total + data.studyMinutes
  }, 0)
}
