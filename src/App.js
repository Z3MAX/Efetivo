import { useEffect, useState } from 'react'
import Login from './pages/Login'
import EfetivoGrade from './pages/EfetivoGrade'

function getSessionFromStorage() {
  try {
    const token = localStorage.getItem('efetivo_token')
    const user  = localStorage.getItem('efetivo_user')
    if (!token || !user) return null
    // Verifica expiração decodificando o payload do JWT (sem verificar assinatura)
    const payload = JSON.parse(atob(token.split('.')[1]))
    if (payload.exp * 1000 < Date.now()) {
      localStorage.removeItem('efetivo_token')
      localStorage.removeItem('efetivo_user')
      return null
    }
    return { user: JSON.parse(user), token }
  } catch {
    return null
  }
}

export default function App() {
  const [session, setSession] = useState(undefined)

  useEffect(() => {
    setSession(getSessionFromStorage())
  }, [])

  function handleLogin(token, user) {
    localStorage.setItem('efetivo_token', token)
    localStorage.setItem('efetivo_user', JSON.stringify(user))
    setSession({ user, token })
  }

  function handleLogout() {
    localStorage.removeItem('efetivo_token')
    localStorage.removeItem('efetivo_user')
    setSession(null)
  }

  if (session === undefined) return <div style={{ padding: 40 }}>Carregando...</div>
  if (!session) return <Login onLogin={handleLogin} />
  return <EfetivoGrade session={session} onLogout={handleLogout} />
}
