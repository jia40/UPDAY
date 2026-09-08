import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { FirebaseError } from 'firebase/app'
import { useAuth } from '../hooks/useAuth'
import { useToday } from '../hooks/useToday'
import { completeTodo, createTodo, fetchTodos, newTodoId, removeTodo, renameTodo, validTitle, type Todo } from '../lib/todos'
import '../styles/today.css'

function message(error: unknown) {
  if (error instanceof FirebaseError) {
    if (error.code === 'permission-denied') return '할 일에 접근할 권한이 없습니다. 로그인과 데이터 접근 설정을 확인해주세요.'
    return '요청을 완료하지 못했습니다. 네트워크 연결을 확인하고 다시 시도해주세요.'
  }
  return error instanceof Error ? error.message : '요청에 실패했습니다. 다시 시도해주세요.'
}

function TodoActions({ title, disabled, onEdit, onDelete }: {
  title: string
  disabled: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const container = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !container.current?.contains(event.target)) setOpen(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        trigger.current?.focus()
      }
    }
    document.addEventListener('pointerdown', dismiss)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', dismiss)
      document.removeEventListener('keydown', escape)
    }
  }, [open])

  return (
    <div className="todo-more" ref={container} onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false)
    }}>
      <button className="todo-more__trigger" ref={trigger} type="button" disabled={disabled}
        aria-label={`${title} 더보기`} aria-expanded={open && !disabled} aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}><span aria-hidden="true">…</span></button>
      {open && !disabled && <div className="todo-more__panel" id={panelId}>
        <button type="button" onClick={() => { setOpen(false); onEdit() }}>수정하기</button>
        <button className="todo-more__delete" type="button" onClick={() => {
          setOpen(false)
          trigger.current?.focus()
          onDelete()
        }}>삭제하기</button>
      </div>}
    </div>
  )
}
function TodayContent({ userId, date }: { userId: string; date: string }) {
  const [todos, setTodos] = useState<Todo[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [error, setError] = useState('')
  const [title, setTitle] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState(false)
  const [retry, setRetry] = useState(0)
  const lock = useRef(false)
  const alive = useRef(true)
  const createId = useRef<string | null>(null)
  useEffect(() => {
    alive.current = true
    let cancelled = false
    fetchTodos(userId, date).then((items) => {
      if (!cancelled) { setTodos(items); setLoadError(''); setLoading(false) }
    }).catch((reason: unknown) => {
      if (!cancelled) { setLoadError(message(reason)); setLoading(false) }
    })
    return () => { cancelled = true; alive.current = false }
  }, [userId, date, retry])

  async function run(action: () => Promise<void>, after?: () => void) {
    if (lock.current) return
    lock.current = true
    setPending(true)
    setError('')
    try {
      if (!navigator.onLine) throw new Error('네트워크 연결을 확인한 후 다시 시도해주세요.')
      await action()
      if (!alive.current) return
      after?.()
      try {
        const items = await fetchTodos(userId, date)
        if (alive.current) { setTodos(items); setLoadError('') }
      } catch (reason) {
        if (alive.current) setLoadError(`저장은 완료했지만 목록을 갱신하지 못했습니다. ${message(reason)}`)
      }
    } catch (reason) {
      if (alive.current) setError(message(reason))
    } finally {
      lock.current = false
      if (alive.current) setPending(false)
    }
  }
  function add(event: FormEvent) {
    event.preventDefault()
    try { validTitle(title) } catch (reason) { setError(message(reason)); return }
    createId.current ??= newTodoId()
    void run(() => createTodo(createId.current!, userId, date, title), () => { setTitle(''); createId.current = null })
  }
  const completed = todos.filter((todo) => todo.completed).length
  const progress = todos.length ? Math.round(completed / todos.length * 100) : 0
  const unavailable = loading || Boolean(loadError)
  return (
    <section className="today-page" aria-labelledby="today-heading">
      <header><p className="today-eyebrow"><span className="today-label">TODAY</span><time dateTime={date}>{date.replaceAll('-', '. ')}</time></p><div className="today-heading-row"><h1 id="today-heading">To do list</h1></div></header>
      <section className="today-panel" aria-label="오늘의 할 일 관리" aria-busy={loading || pending}>
        <div className="today-summary"><h2>오늘 할 일</h2><span>{unavailable ? '집계 대기 중' : `${completed} / ${todos.length} 완료 · ${progress}%`}</span></div>
        {!unavailable && <progress max={100} value={progress} aria-label="오늘 할 일 완료율" />}
        <form className="today-add" onSubmit={add}>
          <label className="today-input-label" htmlFor="todo-title">새 할 일</label>
          <div className="today-input-row"><input id="todo-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={100} placeholder="오늘 할 일을 입력해주세요" disabled={pending || unavailable} /><button disabled={pending || unavailable} type="submit">추가</button></div>
        </form>
        <p className="today-error today-action-error" role="alert">{error}</p>
        <p className="today-save-status" role="status">{pending ? '저장하고 있습니다. 연결이 끊겼다면 다시 연결될 때까지 기다려주세요.' : ''}</p>
        {loading ? <p role="status">오늘의 할 일을 불러오고 있습니다...</p> : loadError ? <div role="alert"><p className="today-error">{loadError}</p><button type="button" disabled={pending} onClick={() => { setLoading(true); setRetry((value) => value + 1) }}>다시 불러오기</button></div> : todos.length === 0 ? <div className="today-empty"><strong>아직 등록한 할 일이 없어요.</strong><p>오늘 할 일을 하나 추가해보세요.</p></div> : (
          <ul className="todo-list" tabIndex={0} aria-label="오늘 할 일 목록">{todos.map((todo) => <li key={todo.id}>
            {editing === todo.id ? <form className="todo-edit" onSubmit={(event) => { event.preventDefault(); void run(() => renameTodo(todo.id, draft), () => setEditing(null)) }}>
              <label htmlFor={`edit-${todo.id}`}>할 일 수정</label><input id={`edit-${todo.id}`} autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={100} disabled={pending} />
              <div className="todo-actions"><button disabled={pending} type="submit">저장</button><button disabled={pending} type="button" onClick={() => { setEditing(null); setError('') }}>취소</button></div>
            </form> : <>
              <label className="todo-check"><input type="checkbox" checked={todo.completed} disabled={pending} onChange={() => void run(() => completeTodo(todo.id, !todo.completed))} /><span className={todo.completed ? 'todo-completed' : ''}>{todo.title}</span></label>
              <TodoActions title={todo.title} disabled={pending}
                onEdit={() => { setEditing(todo.id); setDraft(todo.title); setError('') }}
                onDelete={() => { if (window.confirm(`“${todo.title}” 할 일을 삭제할까요?`)) void run(() => removeTodo(todo.id)) }} />
            </>}
          </li>)}</ul>
        )}
      </section>
      <p className="today-note">오늘 등록한 할 일만 표시됩니다. 지난 기록은 보관되며, 날짜별 조회는 추후 제공됩니다. 미완료 항목은 다음 날로 자동 이동하지 않습니다.</p>
    </section>
  )
}
export default function TodayPage() {
  const { user, isLoading, error } = useAuth()
  const date = useToday()
  if (error) return <p role="alert">{error}</p>
  if (isLoading || !user) return <p role="status">로그인 상태를 확인하고 있습니다...</p>
  return <TodayContent key={`${user.uid}:${date}`} userId={user.uid} date={date} />
}
