import { useEffect, useState } from 'react'
import { api } from './lib/api'
import Login from './pages/Login'

export default function App() {
  const [user, setUser] = useState(undefined)

  useEffect(() => {
    const u = api.getUser()
    if (u) {
      window.location.href = '/app.html'
    } else {
      setUser(null)
    }
  }, [])

  function onLogin() {
    window.location.href = '/app.html'
  }

  if (user === undefined) return <div style={{ padding: 40 }}>Carregando...</div>
  return <Login onLogin={onLogin} />
}
