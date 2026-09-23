import { collection, deleteDoc, doc, getDocsFromServer, query, runTransaction, serverTimestamp, setDoc, updateDoc, where, Timestamp } from 'firebase/firestore'
import { db } from './firebase'

export type Todo = { id: string; userId: string; title: string; completed: boolean; date: string; createdAt: Timestamp }
export function localDate(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}
export function validTitle(value: string) {
  const title = value.trim()
  if (!title || title.length > 100) throw new Error('할 일은 1~100자로 입력해주세요.')
  return title
}
export async function fetchTodos(userId: string, date: string) {
  const snapshot = await getDocsFromServer(query(collection(db, 'todos'), where('userId', '==', userId), where('date', '==', date)))
  return snapshot.docs.map((item) => ({ ...item.data(), id: item.id }) as Todo)
    .sort((a, b) => (a.createdAt?.toMillis() ?? 0) - (b.createdAt?.toMillis() ?? 0) || a.id.localeCompare(b.id))
}
export function newTodoId() { return doc(collection(db, 'todos')).id }
export function createTodo(id: string, userId: string, date: string, title: string) {
  return setDoc(doc(db, 'todos', id), { userId, date, title: validTitle(title), completed: false, createdAt: serverTimestamp() })
}
export function renameTodo(id: string, title: string) { return updateDoc(doc(db, 'todos', id), { title: validTitle(title) }) }
export function completeTodo(id: string, completed: boolean) { return updateDoc(doc(db, 'todos', id), { completed }) }
export function removeTodo(id: string) { return deleteDoc(doc(db, 'todos', id)) }

export async function fetchCarriedTodoIds(userId: string, date: string) {
  const snapshot = await getDocsFromServer(query(collection(db, 'users', userId, 'todoCarryovers'), where('date', '==', date)))
  return new Set(snapshot.docs.map((item) => item.data().sourceTodoId as string))
}

// A permanent receipt survives deletion of the copied todo. Each item commits
// atomically; retrying a partially completed selection skips committed receipts.
export async function carryTodos(userId: string, sourceIds: string[]) {
  const date = localDate()
  for (const sourceId of new Set(sourceIds)) {
    const receipt = doc(db, 'users', userId, 'todoCarryovers', `${sourceId}_${date}`)
    const target = doc(collection(db, 'todos'))
    await runTransaction(db, async (transaction) => {
      if (localDate() !== date) throw new Error('날짜가 변경되었습니다. 오늘 날짜를 확인한 후 다시 시도해주세요.')
      const existing = await transaction.get(receipt)
      if (existing.exists()) return
      const source = await transaction.get(doc(db, 'todos', sourceId))
      const data = source.data()
      if (!data || data.userId !== userId || data.completed !== false || data.date >= date) {
        throw new Error('이월할 수 없는 항목이 있습니다. 목록을 다시 불러온 후 선택해주세요.')
      }
      transaction.set(target, { userId, title: validTitle(data.title), completed: false, date, createdAt: serverTimestamp(), sourceTodoId: sourceId })
      transaction.set(receipt, { sourceTodoId: sourceId, targetTodoId: target.id, date, createdAt: serverTimestamp() })
    })
  }
}
