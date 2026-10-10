import { Component, Suspense, type ReactNode } from 'react'

class PageErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    if (this.state.failed) return <section className="auth-status" role="alert">
      <h1>페이지를 불러오지 못했습니다.</h1>
      <p>연결 상태를 확인하고 다시 시도해주세요.</p>
      <button type="button" onClick={() => window.location.reload()}>다시 불러오기</button>
    </section>
    return this.props.children
  }
}

export default function PageLoader({ children }: { children: ReactNode }) {
  return <PageErrorBoundary><Suspense fallback={<p className="auth-status" role="status">페이지를 불러오고 있습니다.</p>}>{children}</Suspense></PageErrorBoundary>
}
