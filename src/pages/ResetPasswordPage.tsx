import { useRef, useState, type FormEvent } from 'react'
import { FirebaseError } from 'firebase/app'
import { sendPasswordResetEmail } from 'firebase/auth'
import { auth } from '../lib/firebase'
import '../styles/login.css'
import '../styles/reset-password.css'

const COMPLETE_MESSAGE = '비밀번호 재설정이 가능한 계정이라면 안내 메일이 발송됩니다. 메일함과 스팸함을 확인해주세요.'

function errorMessage(error: unknown) {
  const code = error instanceof FirebaseError ? error.code : ''
  switch (code) {
    case 'auth/network-request-failed': return '네트워크 연결을 확인한 뒤 다시 시도해주세요.'
    case 'auth/too-many-requests': return '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.'
    case 'auth/invalid-email': return '올바른 이메일 형식을 입력해주세요.'
    default: return '요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.'
  }
}

export default function ResetPasswordPage() {
  const [email, setEmail] = useState('')
  const [pending, setPending] = useState(false)
  const [complete, setComplete] = useState(false)
  const [error, setError] = useState('')
  const [emailError, setEmailError] = useState('')
  const submitting = useRef(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting.current || complete) return
    const address = email.trim()
    setError('')
    setEmailError('')
    if (!address) { setEmailError('이메일을 입력해주세요.'); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      setEmailError('올바른 이메일 형식을 입력해주세요.')
      return
    }
    submitting.current = true
    setPending(true)
    try {
      await sendPasswordResetEmail(auth, address)
      setComplete(true)
    } catch (reason) {
      if (reason instanceof FirebaseError && reason.code === 'auth/user-not-found') setComplete(true)
      else setError(errorMessage(reason))
    } finally {
      submitting.current = false
      setPending(false)
    }
  }

  return <main className="reset-password-page">
    <section className="reset-password-card" aria-labelledby="reset-heading">
      <a className="brand-logo" href="/login">UPDAY</a>
      <h1 id="reset-heading">비밀번호 재설정</h1>
      {complete ? <p className="reset-password-complete" role="status">{COMPLETE_MESSAGE}</p> : <>
        <p className="reset-password-description">가입할 때 사용한 이메일을 입력해주세요.</p>
        <form className="login-form" onSubmit={submit} noValidate aria-busy={pending}>
          <div className="login-form__field">
            <label htmlFor="reset-email">이메일</label>
            <input id="reset-email" type="email" name="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} disabled={pending} aria-invalid={Boolean(emailError)} aria-describedby={emailError ? 'reset-email-error' : undefined} placeholder="이메일을 입력해주세요" />
            {emailError && <p id="reset-email-error" className="login-form__error" role="alert">{emailError}</p>}
          </div>
          {error && <p className="login-form__message" role="alert">{error}</p>}
          <button className="login-button" type="submit" disabled={pending}>{pending ? '요청 중...' : '비밀번호 재설정 요청'}</button>
          {pending && <p role="status">재설정 메일을 요청하고 있습니다.</p>}
        </form>
      </>}
      <a className="reset-password-back" href="/login">로그인 화면으로 돌아가기</a>
    </section>
  </main>
}
