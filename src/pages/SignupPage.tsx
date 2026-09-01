import GoogleLoginButton from '../components/auth/GoogleLoginButton'
import '../styles/login.css'
import '../styles/signup.css'

function SignupPage() {
  return (
    <main className="signup-page">
      <section className="login-panel signup-panel" aria-labelledby="signup-heading">
        <div className="login-panel__content">
          <h2 id="signup-heading">Upday를 시작해볼까요?</h2>
          <p className="login-panel__description">오늘부터 성장하는 과정을 하나씩 기록해보세요.</p>

          <form className="login-form signup-form">
            <div className="login-form__field">
              <label htmlFor="name">이름</label>
              <input id="name" name="name" type="text" autoComplete="name" placeholder="이름을 입력해주세요" />
            </div>
            <div className="login-form__field">
              <label htmlFor="signup-email">이메일</label>
              <input id="signup-email" name="email" type="email" autoComplete="email" placeholder="이메일을 입력해주세요" />
            </div>
            <div className="login-form__field">
              <label htmlFor="signup-password">비밀번호</label>
              <input id="signup-password" name="password" type="password" autoComplete="new-password" placeholder="비밀번호를 입력해주세요" />
            </div>
            <div className="login-form__field">
              <label htmlFor="password-confirmation">비밀번호 확인</label>
              <input id="password-confirmation" name="passwordConfirmation" type="password" autoComplete="new-password" placeholder="비밀번호를 다시 입력해주세요" />
            </div>
            <button className="login-button" type="button">회원가입</button>
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
