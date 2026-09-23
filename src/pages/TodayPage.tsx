import ConfirmModal from '../components/common/ConfirmModal'
import CompleteModal from '../components/common/CompleteModal'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { FirebaseError } from 'firebase/app'
import { useAuth } from '../hooks/useAuth'
import { useToday } from '../hooks/useToday'
import { carryTodos, completeTodo, createTodo, fetchCarriedTodoIds, fetchTodos, newTodoId, removeTodo, renameTodo, validTitle, type Todo } from '../lib/todos'
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
function TodayContent({ userId, date, today, onDateChange }: { userId: string; date: string; today: string; onDateChange: (date: string) => void }) {
  const history = date < today
  const [selected, setSelected] = useState<string[]>([])
  const [carried, setCarried] = useState<Set<string>>(new Set())
  const [carryConfirm, setCarryConfirm] = useState(false)
  const [carryComplete, setCarryComplete] = useState(false)
  const [todos, setTodos] = useState<Todo[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [error, setError] = useState('')
  const [title, setTitle] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Todo | null>(null)
  const [deleteComplete, setDeleteComplete] = useState(false)
  const [retry, setRetry] = useState(0)
  const lock = useRef(false)
  const alive = useRef(true)
  const createId = useRef<string | null>(null)
  useEffect(() => {
    alive.current = true
    let cancelled = false
    Promise.all([fetchTodos(userId, date), history ? fetchCarriedTodoIds(userId, today) : Promise.resolve(new Set<string>())]).then(([items, ids]) => {
      if (!cancelled) { setTodos(items); setCarried(ids); setSelected([]); setLoadError(''); setLoading(false) }
    }).catch((reason: unknown) => {
      if (!cancelled) { setLoadError(message(reason)); setLoading(false) }
    })
    return () => { cancelled = true; alive.current = false }
  }, [userId, date, today, history, retry])

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
        const [items, ids] = await Promise.all([fetchTodos(userId, date), history ? fetchCarriedTodoIds(userId, today) : Promise.resolve(new Set<string>())])
        if (alive.current) { setTodos(items); setCarried(ids); setLoadError('') }
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
      <div className="today-date-controls">
        <label htmlFor="todo-date">조회 날짜</label>
        <input id="todo-date" type="date" value={date} min="0001-01-01" max={today} disabled={pending || carryConfirm || deleteTarget !== null} onChange={(event) => {
          const value = event.target.value
          if (event.target.validity.valid && value && value <= today) onDateChange(value)
        }} />
        <button type="button" disabled={!history || pending || carryConfirm || deleteTarget !== null} onClick={() => onDateChange(today)}>오늘로</button>
      </div>
      <section className="today-panel" aria-label="날짜별 할 일 관리" aria-busy={loading || pending}>
        <div className="today-summary"><h2>{history ? '지난 할 일' : '오늘 할 일'}</h2><span>{unavailable ? '집계 대기 중' : `${completed} / ${todos.length} 완료 · ${progress}%`}</span></div>
        {!unavailable && <progress max={100} value={progress} aria-label="선택한 날짜의 할 일 완료율" />}
        {!history && <form className="today-add" onSubmit={add}>
          <label className="today-input-label" htmlFor="todo-title">새 할 일</label>
          <div className="today-input-row"><input id="todo-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={100} placeholder="오늘 할 일을 입력해주세요" disabled={pending || unavailable} /><button disabled={pending || unavailable} type="submit">추가</button></div>
        </form>}
        {history && <div className="today-carry-controls">
          <span role="status">{selected.length}개 선택</span>
          <button type="button" disabled={unavailable || pending} onClick={() => { setSelected([]); setLoading(true); setRetry((value) => value + 1) }}>목록 새로고침</button>
          <button type="button" disabled={unavailable || pending || selected.length === 0} onClick={() => { setError(''); setCarryConfirm(true) }}>오늘로 가져오기</button>
        </div>}
        <p className="today-error today-action-error" role="alert">{error}</p>
        <p className="today-save-status" role="status">{pending ? '저장하고 있습니다. 연결이 끊겼다면 다시 연결될 때까지 기다려주세요.' : ''}</p>
        {loading ? <p role="status">할 일을 불러오고 있습니다...</p> : loadError ? <div role="alert"><p className="today-error">{loadError}</p><button type="button" disabled={pending} onClick={() => { setLoading(true); setRetry((value) => value + 1) }}>다시 불러오기</button></div> : todos.length === 0 ? <div className="today-empty"><strong>{history ? '이 날짜에 등록한 할 일이 없어요.' : '아직 등록한 할 일이 없어요.'}</strong>{!history && <p>오늘 할 일을 하나 추가해보세요.</p>}</div> : (
          <ul className="todo-list" tabIndex={0} aria-label="선택한 날짜의 할 일 목록">{todos.map((todo) => <li key={todo.id}>
            {history ? <>
              <label className="todo-check"><input type="checkbox" aria-label={`${todo.title} 이월 선택`} checked={selected.includes(todo.id)} disabled={pending || todo.completed || carried.has(todo.id)} onChange={(event) => setSelected((ids) => event.target.checked ? [...ids, todo.id] : ids.filter((id) => id !== todo.id))} /><span className={todo.completed ? 'todo-completed' : ''}>{todo.title}</span></label>
              <span className="todo-history-status">{carried.has(todo.id) ? '오늘로 이월됨' : todo.completed ? '완료' : '미완료'}</span>
            </> : editing === todo.id ? <form className="todo-edit" onSubmit={(event) => { event.preventDefault(); void run(() => renameTodo(todo.id, draft), () => setEditing(null)) }}>
              <label htmlFor={`edit-${todo.id}`}>할 일 수정</label><input id={`edit-${todo.id}`} autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={100} disabled={pending} />
              <div className="todo-actions"><button disabled={pending} type="submit">저장</button><button disabled={pending} type="button" onClick={() => { setEditing(null); setError('') }}>취소</button></div>
            </form> : <>
              <label className="todo-check"><input type="checkbox" checked={todo.completed} disabled={pending} onChange={() => void run(() => completeTodo(todo.id, !todo.completed))} /><span className={todo.completed ? 'todo-completed' : ''}>{todo.title}</span></label>
              <TodoActions title={todo.title} disabled={pending}
                onEdit={() => { setEditing(todo.id); setDraft(todo.title); setError('') }}
                onDelete={() => { setError(''); setDeleteTarget(todo) }} />
            </>}
          </li>)}</ul>
        )}
      </section>
      <p className="today-note">지난 날짜는 조회만 가능합니다. 미완료 항목을 선택해 오늘로 가져오면 원본을 보관하고 새 할 일을 만듭니다. 자동 이월되지 않으며, 오늘로 가져온 항목을 삭제해도 같은 날 다시 이월할 수 없습니다.</p>
      <ConfirmModal open={carryConfirm} title="오늘로 가져오기" message={`선택한 ${selected.length}개 항목을 오늘 할 일로 가져올까요? 지난 기록은 그대로 유지됩니다.`} confirmLabel="가져오기" isPending={pending} error={error}
        onClose={() => { if (!lock.current) { setCarryConfirm(false); setError('') } }}
        onConfirm={() => void run(() => carryTodos(userId, selected), () => { setSelected([]); setCarryConfirm(false); setCarryComplete(true) })} />
      <CompleteModal open={carryComplete} message="선택한 항목을 오늘로 가져왔습니다. 이미 이월한 항목은 중복 생성하지 않았습니다." onClose={() => { setCarryComplete(false); onDateChange(today) }} />
      <ConfirmModal open={deleteTarget !== null} title="할 일 삭제" message={deleteTarget ? '“' + deleteTarget.title + '” 할 일을 삭제하시겠습니까?' : ''}
        confirmLabel="삭제하기" destructive isPending={pending} error={error}
        onClose={() => { if (!lock.current) { setDeleteTarget(null); setError('') } }}
        onConfirm={() => {
          if (deleteTarget) void run(() => removeTodo(deleteTarget.id), () => { setDeleteTarget(null); setDeleteComplete(true) })
        }} />
      <CompleteModal open={deleteComplete} message="할 일 삭제가 완료되었습니다." onClose={() => setDeleteComplete(false)} />
    </section>
  )
}
export default function TodayPage() {
  const { user, isLoading, error } = useAuth()
  const date = useToday()
  if (error) return <p role="alert">{error}</p>
  if (isLoading || !user) return <p role="status">로그인 상태를 확인하고 있습니다...</p>
  return <TodayBrowser key={`${user.uid}:${date}`} userId={user.uid} today={date} />
}

function TodayBrowser({ userId, today }: { userId: string; today: string }) {
  const [date, setDate] = useState(today)
  return <TodayContent key={date} userId={userId} date={date} today={today} onDateChange={setDate} />
}
