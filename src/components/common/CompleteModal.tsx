import Modal from './Modal'

type CompleteModalProps = {
  open: boolean
  title?: string
  message?: string
  confirmLabel?: string
  onClose: () => void
}

export default function CompleteModal({ open, title = '완료되었습니다', message = '요청하신 작업이 완료되었습니다.', confirmLabel = '확인', onClose }: CompleteModalProps) {
  return (
    <Modal open={open} title={title} message={message} variant="complete" onClose={onClose}>
      <button className="common-modal__button common-modal__button--primary" type="button" autoFocus onClick={onClose}>{confirmLabel}</button>
    </Modal>
  )
}
