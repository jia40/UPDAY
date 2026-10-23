import { useState } from 'react'
import { updateProfile, type User } from 'firebase/auth'
import { FirebaseError } from 'firebase/app'
import { useAuth } from '../hooks/useAuth'
import { useStudyMutation } from '../hooks/useStudyMutation'
import { useUnsavedChanges } from '../hooks/useUnsavedChanges'
import ConfirmModal from '../components/common/ConfirmModal'
import { auth } from '../lib/firebase'
import { validateName } from '../lib/profile'
import '../styles/mypage.css'

function profileError(reason: unknown) {
  if (reason instanceof FirebaseError) return reason.code === 'auth/requires-recent-login' ? '다시 로그인한 후 이름을 수정해주세요.' : '이름을 저장하지 못했습니다. 연결 상태를 확인하고 다시 시도해주세요.'
  return reason instanceof Error ? reason.message : '이름을 저장하지 못했습니다. 다시 시도해주세요.'
}
function Account({ user }: { user: User }) {
  const { refreshProfile } = useAuth()
  const [savedName, setSavedName] = useState(user.displayName?.trim() ?? '')
  const [name, setName] = useState(savedName)
  const [message, setMessage] = useState('')
  const { pending, error, setError, status, mutate } = useStudyMutation(profileError)
  const dirty = name !== savedName
  const leave = useUnsavedChanges(dirty || pending, pending)
  const created = user.metadata.creationTime ? new Date(user.metadata.creationTime) : null
  const createdLabel = created && !Number.isNaN(created.getTime()) ? created.toLocaleDateString('ko-KR') : '가입일 정보가 없습니다.'
  function submit(event: React.FormEvent) {
    event.preventDefault()
    if (leave.blocked) return
    setMessage(''); setError('')
    let value: string
    try { value = validateName(name) } catch (reason) { setError(profileError(reason)); return }
    if (value === savedName) { setName(savedName); setMessage('변경된 이름이 없습니다.'); return }
    void mutate(async () => {
      if (auth.currentUser?.uid !== user.uid) throw new Error('로그인 상태가 변경되었습니다. 다시 로그인해주세요.')
      await updateProfile(user, { displayName: value })
      refreshProfile(user)
    }, () => { setSavedName(value); setName(value); setMessage('이름이 저장되었습니다.') })
  }
  return <section className="mypage" aria-labelledby="mypage-heading">
    <header><p className="mypage-eyebrow">MY PAGE</p><h1 id="mypage-heading">마이페이지</h1><p>내 계정 정보를 확인하고 이름을 변경해보세요.</p></header>
    <section className="mypage-panel" aria-labelledby="account-heading"><h2 id="account-heading">계정 정보</h2>
      <dl className="mypage-info"><div><dt>이름</dt><dd>{savedName || '등록된 이름이 없습니다.'}</dd></div><div><dt>이메일</dt><dd>{user.email || '등록된 이메일이 없습니다.'}</dd></div><div><dt>가입일</dt><dd>{createdLabel}</dd></div></dl>
    </section>
    <section className="mypage-panel" aria-labelledby="profile-heading"><h2 id="profile-heading">이름 수정</h2>
      <form onSubmit={submit} noValidate><fieldset disabled={leave.blocked}>
        <label htmlFor="profile-name">이름</label><input id="profile-name" autoComplete="name" required maxLength={50} value={name} aria-invalid={Boolean(error)} aria-describedby="profile-name-help profile-name-error" onChange={event => { setName(event.target.value); setMessage(''); setError('') }} />
        <p id="profile-name-help" className="mypage-help">2~50자로 입력해주세요. 앞뒤 공백은 제거하며 대시보드 인사말에 사용합니다.</p>
        <div className="mypage-actions"><button type="submit">{pending ? '저장 중…' : '이름 저장'}</button><button type="button" disabled={!dirty} onClick={() => { setName(savedName); setError(''); setMessage('수정을 취소했습니다.') }}>수정 취소</button></div>
      </fieldset></form><p id="profile-name-error" className="mypage-error" role="alert">{error}</p><p role="status">{status || message}</p>
    </section>
    <ConfirmModal open={leave.open} title="작성 내용 확인" message="수정 중인 이름은 저장되지 않습니다. 나가시겠습니까?" confirmLabel="나가기" cancelLabel="계속 수정" onClose={leave.cancel} onConfirm={leave.confirm} />
  </section>
}
export default function MyPage() {
  const { user, isLoading, error } = useAuth()
  if (error) return <p role="alert">{error}</p>
  if (isLoading || !user) return <p role="status">로그인 상태를 확인하고 있습니다.</p>
  return <Account key={user.uid} user={user} />
}
