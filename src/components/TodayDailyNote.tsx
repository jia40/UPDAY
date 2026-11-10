import { useId } from 'react'
import type { useDailyNote } from '../hooks/useDailyNote'
import { DAILY_NOTE_LIMIT } from '../lib/dailyNotes'
import ConfirmModal from './common/ConfirmModal'

export default function TodayDailyNote({ note, disabled }: { note: ReturnType<typeof useDailyNote>; disabled: boolean }) {
  const id = useId()
  const blocked = disabled || note.pending || note.saved === null || note.confirmDelete
  return <section className="today-panel today-daily-note" aria-labelledby={`${id}-heading`}>
    <div className="today-summary"><h2 id={`${id}-heading`}>한 줄 기록</h2></div>
    {note.loading && <p role="status">한 줄 기록을 불러오고 있습니다.</p>}
    {note.loadError && <div role="alert"><p className="today-error">{note.loadError}</p><button type="button" disabled={disabled || note.loading || note.pending} onClick={note.retry}>한 줄 기록 다시 불러오기</button></div>}
    {note.saved !== null && <form onSubmit={event => { event.preventDefault(); if (!blocked) note.save() }}>
      {!note.loading && !note.loadError && !note.saved && <p>이 날짜에 남기고 싶은 일이나 생각을 적어보세요.</p>}
      <label htmlFor={id}>한 줄 기록 내용</label>
      <textarea id={id} rows={2} maxLength={DAILY_NOTE_LIMIT} aria-describedby={`${id}-count`} value={note.draft} disabled={blocked} onChange={event => note.change(event.target.value)} />
      <p id={`${id}-count`}>{note.draft.length} / {DAILY_NOTE_LIMIT}자</p>
      <div className="today-daily-note__actions">
        <button type="submit" disabled={blocked || !note.dirty}>한 줄 기록 저장</button>
        {note.dirty && <button type="button" disabled={blocked} onClick={note.reset}>입력 되돌리기</button>}
        {note.saved && <button type="button" disabled={blocked} onClick={note.openDelete}>한 줄 기록 삭제</button>}
      </div>
    </form>}
    {note.error && !note.confirmDelete && <p className="today-error" role="alert">{note.error}</p>}
    {note.status && <p role="status">{note.status}</p>}
    <ConfirmModal open={note.confirmDelete} title="한 줄 기록 삭제" message="이 날짜의 한 줄 기록을 삭제할까요? 작성 중인 변경 사항도 사라집니다." destructive confirmLabel="삭제하기" isPending={note.pending} error={note.error} onClose={note.closeDelete} onConfirm={note.remove} />
  </section>
}
