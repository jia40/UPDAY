import DashboardPage from './pages/DashboardPage'
import LoginPage from './pages/LoginPage'
import SignupPage from './pages/SignupPage'

function App() {
  if (window.location.pathname === '/signup') return <SignupPage />
  if (window.location.pathname === '/dashboard') return <DashboardPage />
  return <LoginPage />
}

export default App
