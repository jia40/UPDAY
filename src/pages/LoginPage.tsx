import { useState, type FormEvent } from 'react'
import { FirebaseError } from 'firebase/app'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { auth } from '../lib/firebase'
import '../styles/login.css'

type LoginErrors = Partial<Record<'email' | 'password' | 'form', string>>

function getLoginErrorMessage(error: unknown) {
  if (!(error instanceof FirebaseError)) {
    return '로그인 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.'
  }

  switch (error.code) {
    case 'auth/invalid-credential':
    case 'auth/user-not-found':
    case 'auth/wrong-password': return '이메일 또는 비밀번호가 올바르지 않습니다.'
    case 'auth/invalid-email': return '올바른 이메일 형식을 입력해주세요.'
    case 'auth/user-disabled': return '사용이 중지된 계정입니다. 관리자에게 문의해주세요.'
    case 'auth/network-request-failed': return '네트워크 연결을 확인해주세요.'
    case 'auth/too-many-requests': return '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.'
    default: return '로그인에 실패했습니다. 잠시 후 다시 시도해주세요.'
  }
}

function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<LoginErrors>({})
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isLoading) return

    const nextErrors: LoginErrors = {}
    if (!email.trim()) nextErrors.email = '이메일을 입력해주세요.'
    if (!password) nextErrors.password = '비밀번호를 입력해주세요.'

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors)
      return
    }

    setErrors({})
    setIsLoading(true)

    try {
      await signInWithEmailAndPassword(auth, email.trim(), password)
      window.location.assign('/dashboard')
    } catch (error) {
      setErrors({ form: getLoginErrorMessage(error) })
      setIsLoading(false)
    }
  }

  return (
    <main className="login-page">
      <section className="brand-panel" aria-labelledby="brand-heading">
        <div className="brand-panel__content">
          <a className="brand-logo" href="/" aria-label="Upday 홈">
            <span className="brand-logo__mark" aria-hidden="true" /> UPDAY
          </a>
          <div className="brand-copy">
            <h1 id="brand-heading">매일의 나를<br />업데이트하세요.</h1>
            <p>오늘의 학습부터 취업 준비까지,<br />개발자로 성장하는 과정을 기록해보세요.</p>
          </div>
          <div className="dashboard-preview" aria-label="Upday 대시보드 미리보기">
            <div className="dashboard-preview__top">
              <div><span className="dashboard-preview__eyebrow">오늘의 성장</span><strong>80%</strong></div>
              <span className="dashboard-preview__streak">🔥 14일 연속 학습</span>
            </div>
            <div className="dashboard-preview__progress" role="progressbar" aria-label="오늘의 성장 진행률" aria-valuemin={0} aria-valuemax={100} aria-valuenow={80}><span /></div>
            <div className="dashboard-preview__stats">
              <div><span>Study</span><strong>2h 30m</strong></div>
              <div><span>Interview</span><strong>3</strong></div>
            </div>
          </div>
        </div>
      </section>
      <section className="login-panel" aria-labelledby="login-heading">
        <div className="login-panel__content">
          <p className="login-panel__eyebrow">WELCOME BACK</p>
          <h2 id="login-heading">다시 만나서 반가워요</h2>
          <p className="login-panel__description">오늘의 성장을<br />Upday에 기록해보세요.</p>
          <form className="login-form" onSubmit={handleSubmit} noValidate>
            <div className="login-form__field">
              <label htmlFor="email">이메일</label>
              <input id="email" name="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="이메일을 입력해주세요" aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? 'login-email-error' : undefined} disabled={isLoading} />
              {errors.email && <p id="login-email-error" className="login-form__error">{errors.email}</p>}
            </div>
            <div className="login-form__field">
              <label htmlFor="password">비밀번호</label>
              <input id="password" name="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" placeholder="비밀번호를 입력해주세요" aria-invalid={Boolean(errors.password)} aria-describedby={errors.password ? 'login-password-error' : undefined} disabled={isLoading} />
              {errors.password && <p id="login-password-error" className="login-form__error">{errors.password}</p>}
            </div>
            {errors.form && <p className="login-form__message" role="alert">{errors.form}</p>}
            <button className="login-button" type="submit" disabled={isLoading}>{isLoading ? '로그인 중...' : '로그인'}</button>
          </form>
          <p className="signup-link">
            계정이 없으신가요? <a href="/signup">회원가입으로 가기</a>
          </p>
          <p className="login-panel__notice">계속하면 Upday의 이용약관 및 개인정보처리방침에 동의하게 됩니다.</p>
        </div>
      </section>
    </main>
  )
}

export default LoginPage
