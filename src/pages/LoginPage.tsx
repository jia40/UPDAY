import '../styles/login.css'

function LoginPage() {
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
          <form className="login-form">
            <div className="login-form__field">
              <label htmlFor="email">이메일</label>
              <input id="email" name="email" type="email" autoComplete="email" placeholder="이메일을 입력해주세요" />
            </div>
            <div className="login-form__field">
              <label htmlFor="password">비밀번호</label>
              <input id="password" name="password" type="password" autoComplete="current-password" placeholder="비밀번호를 입력해주세요" />
            </div>
            <button className="login-button" type="button">로그인</button>
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
