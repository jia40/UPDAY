import { collection, deleteDoc, doc, getDocsFromServer, query, serverTimestamp, setDoc, updateDoc, where, Timestamp } from 'firebase/firestore'
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
