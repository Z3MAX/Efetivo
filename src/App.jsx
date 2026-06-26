import { useEffect, useState } from 'react'
import { api } from './lib/api'
import Login from './pages/Login'
import EfetivoGrade from './pages/EfetivoGrade'

export default function App() {
  const [user, setUser] = useState(undefined)

  useEffect(() => {
    setUser(api.getUser())
  }, [])

  function onLogin(u) {
    setUser(u)
  }

  function onLogout() {
    api.logout()
    setUser(null)
  }

  if (user === undefined) return <div style={{ padding: 40 }}>Carregando...</div>
  if (!user) return <Login onLogin={onLogin} />
  return <EfetivoGrade user={user} onLogout={onLogout} />
}
