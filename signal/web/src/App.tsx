import { useState, useEffect } from 'react'
import { api } from './api'
import { Login } from './pages/Login'
import { Dashboard } from './pages/Dashboard'
import './App.css'

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Check if user is already logged in
    if (api.isAuthenticated()) {
      setIsAuthenticated(true)
    }
    setLoading(false)
  }, [])

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '50px' }}>Loading...</div>
  }

  return isAuthenticated ? (
    <Dashboard
      onLogout={() => {
        api.logout()
        setIsAuthenticated(false)
      }}
    />
  ) : (
    <Login onLoginSuccess={() => setIsAuthenticated(true)} />
  )
}

export default App
