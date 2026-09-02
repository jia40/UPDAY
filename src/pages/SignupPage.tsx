import { useState, type FormEvent } from 'react'
import { FirebaseError } from 'firebase/app'
import { createUserWithEmailAndPassword, signOut, updateProfile } from 'firebase/auth'
import GoogleLoginButton from '../components/auth/GoogleLoginButton'
import { auth } from '../lib/firebase'
import '../styles/login.css'
import '../styles/signup.css'

type SignupErrors = Partial<Record<
  'name' | 'email' | 'password' | 'passwordConfirmation' | 'form',
  string
>>

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function getSignupErrorMessage(error: unknown) {
  if (!(error instanceof FirebaseError)) {
    return '회원가입 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.'
  }

  switch (error.code) {
    case 'auth/email-already-in-use': return '이미 가입된 이메일입니다.'
    case 'auth/invalid-email': return '올바르지 않은 이메일 형식입니다.'
    case 'auth/weak-password': return '비밀번호는 8자 이상이어야 합니다.'
    case 'auth/operation-not-allowed': return '이메일 회원가입을 사용할 수 없습니다. 관리자에게 문의해주세요.'
    case 'auth/network-request-failed': return '네트워크 연결을 확인해주세요.'
    case 'auth/too-many-requests': return '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.'
    default: return '회원가입에 실패했습니다. 잠시 후 다시 시도해주세요.'
  }
}

function SignupPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirmation, setPasswordConfirmation] = useState('')
  const [errors, setErrors] = useState<SignupErrors>({})
  const [isLoading, setIsLoading] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')

  const validateSignup = () => {
    const nextErrors: SignupErrors = {}

    if (!name.trim()) nextErrors.name = '이름을 입력해주세요.'
    else if (name.trim().length < 2) nextErrors.name = '이름은 2자 이상 입력해주세요.'

    if (!email.trim()) nextErrors.email = '이메일을 입력해주세요.'
    else if (!EMAIL_PATTERN.test(email.trim())) nextErrors.email = '올바른 이메일 형식을 입력해주세요.'

    if (!password) nextErrors.password = '비밀번호를 입력해주세요.'
    else if (password.length < 8) nextErrors.password = '비밀번호는 8자 이상이어야 합니다.'

    if (!passwordConfirmation) nextErrors.passwordConfirmation = '비밀번호를 다시 입력해주세요.'
    else if (password !== passwordConfirmation) nextErrors.passwordConfirmation = '비밀번호가 일치하지 않습니다.'

    return nextErrors
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isLoading) return

    setSuccessMessage('')
    const validationErrors = validateSignup()

    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors)
      return
    }

    setErrors({})
    setIsLoading(true)

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email.trim(), password)
      await updateProfile(userCredential.user, { displayName: name.trim() })
      await signOut(auth)

      setSuccessMessage('회원가입이 완료되었습니다. 로그인 화면으로 이동합니다.')
      window.setTimeout(() => window.location.assign('/login'), 800)
    } catch (error) {
      setErrors({ form: getSignupErrorMessage(error) })
      setIsLoading(false)
    }
  }

  return (
    <main className="signup-page">
      <section className="login-panel signup-panel" aria-labelledby="signup-heading">
        <div className="login-panel__content">
          <h2 id="signup-heading">Upday를 시작해볼까요?</h2>
          <p className="login-panel__description">오늘부터 성장하는 과정을 하나씩 기록해보세요.</p>

          <form className="login-form signup-form" onSubmit={handleSubmit} noValidate>
            <div className="login-form__field">
              <label htmlFor="name">이름</label>
              <input id="name" name="name" type="text" value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" placeholder="이름을 입력해주세요" aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? 'name-error' : undefined} disabled={isLoading} />
              {errors.name && <p id="name-error" className="signup-form__error">{errors.name}</p>}
            </div>
            <div className="login-form__field">
              <label htmlFor="signup-email">이메일</label>
              <input id="signup-email" name="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="이메일을 입력해주세요" aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? 'email-error' : undefined} disabled={isLoading} />
              {errors.email && <p id="email-error" className="signup-form__error">{errors.email}</p>}
            </div>
            <div className="login-form__field">
              <label htmlFor="signup-password">비밀번호</label>
              <input id="signup-password" name="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" placeholder="8자 이상 입력해주세요" aria-invalid={Boolean(errors.password)} aria-describedby={errors.password ? 'password-error' : undefined} disabled={isLoading} />
              {errors.password && <p id="password-error" className="signup-form__error">{errors.password}</p>}
            </div>
            <div className="login-form__field">
              <label htmlFor="password-confirmation">비밀번호 확인</label>
              <input id="password-confirmation" name="passwordConfirmation" type="password" value={passwordConfirmation} onChange={(event) => setPasswordConfirmation(event.target.value)} autoComplete="new-password" placeholder="비밀번호를 다시 입력해주세요" aria-invalid={Boolean(errors.passwordConfirmation)} aria-describedby={errors.passwordConfirmation ? 'password-confirmation-error' : undefined} disabled={isLoading} />
              {errors.passwordConfirmation && <p id="password-confirmation-error" className="signup-form__error">{errors.passwordConfirmation}</p>}
            </div>
            {errors.form && <p className="signup-form__message signup-form__message--error" role="alert">{errors.form}</p>}
            {successMessage && <p className="signup-form__message signup-form__message--success" role="status">{successMessage}</p>}
            <button className="login-button" type="submit" disabled={isLoading}>{isLoading ? '가입하는 중...' : '회원가입'}</button>
          </form>

          <div className="signup-divider"><span>또는</span></div>
          <GoogleLoginButton />
          <p className="signup-link">이미 계정이 있나요? <a href="/login">로그인</a></p>
        </div>
      </section>
    </main>
  )
}

export default SignupPage
