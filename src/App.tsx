import LoginPage from './pages/LoginPage'
import SignupPage from './pages/SignupPage'

function App() {
  return window.location.pathname === '/signup' ? <SignupPage /> : <LoginPage />
}

export default App
