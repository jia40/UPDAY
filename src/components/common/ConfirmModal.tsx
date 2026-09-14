import Modal from './Modal'

type ConfirmModalProps = {
  open: boolean
  title?: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  isPending?: boolean
  error?: string
  onConfirm: () => void
  onClose: () => void
}

export default function ConfirmModal({ open, title = '확인해주세요', message, confirmLabel = '확인', cancelLabel = '취소', destructive = false, isPending = false, error, onConfirm, onClose }: ConfirmModalProps) {
  return (
    <Modal open={open} title={title} message={message} onClose={onClose} variant={destructive ? 'danger' : 'confirm'} busy={isPending} error={error}>
      <button className="common-modal__button common-modal__button--secondary" type="button" autoFocus disabled={isPending} onClick={onClose}>{cancelLabel}</button>
      <button className="common-modal__button common-modal__button--primary" type="button" disabled={isPending} onClick={onConfirm}>{isPending ? '처리 중…' : confirmLabel}</button>
    </Modal>
  )
}
