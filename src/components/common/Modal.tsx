import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import '../../styles/modal.css'

export type ModalProps = {
  open: boolean
  title: string
  message: string
  onClose: () => void
  children: ReactNode
  variant?: 'confirm' | 'danger' | 'complete'
  busy?: boolean
  error?: string
}

export default function Modal({ open, title, message, onClose, children, variant = 'confirm', busy = false, error }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const pointerStartedOutside = useRef(false)
  const titleId = useId()
  const messageId = useId()

  useEffect(() => {
    if (!open) return
    const dialog = dialogRef.current
    if (!dialog) return
    const previousFocus = document.activeElement
    const previousOverflow = document.body.style.overflow
    dialog.showModal()
    document.body.style.overflow = 'hidden'
    return () => {
      dialog.close()
      document.body.style.overflow = previousOverflow
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus()
    }
  }, [open])

  function outside(event: React.PointerEvent<HTMLDialogElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    return event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom
  }

  if (!open) return null
  return createPortal(
    <dialog ref={dialogRef} className={`common-modal common-modal--${variant}`} aria-labelledby={titleId} aria-describedby={messageId}
      onCancel={(event) => { event.preventDefault(); if (!busy) onClose() }}
      onPointerDown={(event) => { pointerStartedOutside.current = event.target === event.currentTarget && outside(event) }}
      onPointerUp={(event) => {
        if (!busy && pointerStartedOutside.current && event.target === event.currentTarget && outside(event)) onClose()
        pointerStartedOutside.current = false
      }}>
      <div className="common-modal__body">
        {variant === 'confirm' && (
          <span className="common-modal__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 11v6" />
              <circle cx="12" cy="7.5" r=".8" fill="currentColor" stroke="none" />
            </svg>
          </span>
        )}
        {variant === 'danger' && (
          <span className="common-modal__icon common-modal__icon--warning" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.3 4.2 2.5 18a2 2 0 0 0 1.7 3h15.6a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0Z" />
              <path d="M12 9v4" />
              <circle cx="12" cy="17" r=".8" fill="currentColor" stroke="none" />
            </svg>
          </span>
        )}
        {variant === 'complete' && <span className="common-modal__icon" aria-hidden="true">✓</span>}
        <h2 id={titleId}>{title}</h2>
        <p id={messageId} className="common-modal__message">{message}</p>
        <p className="common-modal__error" role="alert">{error}</p>
        <p className="common-modal__status" role="status">{busy ? '처리 중입니다. 잠시 기다려주세요.' : ''}</p>
      </div>
      <div className="common-modal__actions" aria-busy={busy}>{children}</div>
    </dialog>, document.body,
  )
}
