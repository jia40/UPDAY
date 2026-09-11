import { useEffect, useId, useRef, useState } from 'react'

export default function StudyRecordActions({ title, disabled, onEdit, onDelete }: {
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
    <div className="study-more" ref={container} onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false)
    }}>
      <button className="study-more__trigger" ref={trigger} type="button" disabled={disabled}
        aria-label={`${title} 더보기`} aria-expanded={open && !disabled} aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}><span aria-hidden="true">…</span></button>
      {open && !disabled && <div className="study-more__panel" id={panelId}>
        <button type="button" onClick={() => { setOpen(false); onEdit() }}>수정하기</button>
        <button className="study-more__delete" type="button" onClick={() => {
          setOpen(false)
          trigger.current?.focus()
          onDelete()
        }}>삭제하기</button>
      </div>}
    </div>
  )
}
