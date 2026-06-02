import { useState } from 'react'
import { api } from '../lib/api'

export default function Login({ onLogin }) {
  const [email, setEmail]   = useState('')
  const [senha, setSenha]   = useState('')
  const [erro, setErro]     = useState('')
  const [loading, setLoading] = useState(false)

  async function entrar(e) {
    e.preventDefault()
    setErro('')
    setLoading(true)
    try {
      const { token, user } = await api.login(email, senha)
      onLogin(token, user)
    } catch (err) {
      setErro(err.message || 'E-mail ou senha incorretos.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={s.page}>
      <form onSubmit={entrar} style={s.card}>
        <div style={s.logo}>RTT</div>
        <h2 style={s.titulo}>Efetivo</h2>
        <input style={s.input} type="email" placeholder="E-mail" value={email}
          onChange={e => setEmail(e.target.value)} required />
        <input style={s.input} type="password" placeholder="Senha" value={senha}
          onChange={e => setSenha(e.target.value)} required />
        {erro && <p style={s.erro}>{erro}</p>}
        <button style={s.btn} type="submit" disabled={loading}>
          {loading ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
    </div>
  )
}

const s = {
  page:   { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0f2f5' },
  card:   { background: '#fff', borderRadius: 12, padding: '40px 36px', width: 340, boxShadow: '0 2px 16px rgba(0,0,0,.1)', display: 'flex', flexDirection: 'column', gap: 14 },
  logo:   { fontSize: 28, fontWeight: 800, color: '#c8000a', letterSpacing: 2, textAlign: 'center' },
  titulo: { textAlign: 'center', fontSize: 18, color: '#444', fontWeight: 500, marginTop: -6 },
  input:  { padding: '10px 12px', borderRadius: 7, border: '1px solid #ddd', fontSize: 15, outline: 'none' },
  btn:    { padding: '11px', borderRadius: 7, background: '#c8000a', color: '#fff', border: 'none', fontSize: 15, fontWeight: 600, cursor: 'pointer', marginTop: 4 },
  erro:   { color: '#c8000a', fontSize: 13, textAlign: 'center' },
}
