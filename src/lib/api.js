/**
 * api.js — Cliente HTTP para as Netlify Functions (Neon DB)
 * Substitui o cliente Supabase para chamadas de dados.
 */

const BASE = '/api'

function getToken() {
  return localStorage.getItem('efetivo_token')
}

async function req(path, options = {}) {
  const token = getToken()
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.erro || `Erro ${res.status}`)
  return data
}

export const api = {
  async login(email, senha) {
    const data = await req('/login', {
      method: 'POST',
      body: JSON.stringify({ email, senha }),
    })
    localStorage.setItem('efetivo_token', data.token)
    localStorage.setItem('efetivo_user', JSON.stringify(data.user))
    return data
  },

  logout() {
    localStorage.removeItem('efetivo_token')
    localStorage.removeItem('efetivo_user')
  },

  getUser() {
    try {
      return JSON.parse(localStorage.getItem('efetivo_user'))
    } catch {
      return null
    }
  },

  projetos: () => req('/projetos'),

  funcionarios: (params = {}) =>
    req(`/funcionarios?${new URLSearchParams(params)}`),

  presencas: (params = {}) =>
    req(`/presencas?${new URLSearchParams(params)}`),

  salvarPresenca: (body) =>
    req('/presencas', { method: 'POST', body: JSON.stringify(body) }),

  salvarPresencasBulk: (body) =>
    req('/presencas/bulk', { method: 'POST', body: JSON.stringify(body) }),

  abonos: (params = {}) =>
    req(`/abonos?${new URLSearchParams(params)}`),

  ausencias: (params = {}) =>
    req(`/ausencias?${new URLSearchParams(params)}`),

  ausenciasManual: (params = {}) =>
    req(`/ausencias/manual?${new URLSearchParams(params)}`),

  salvarAusenciasManual: (body) =>
    req('/ausencias/manual', { method: 'POST', body: JSON.stringify(body) }),

  deletarAusenciaManual: (id) =>
    req(`/ausencias/manual/${id}`, { method: 'DELETE' }),

  atestados: (params = {}) =>
    req(`/atestados?${new URLSearchParams(params)}`),

  fechamento: (params = {}) =>
    req(`/fechamento?${new URLSearchParams(params)}`),

  fecharMes: (mes, ano) =>
    req('/fechamento', { method: 'POST', body: JSON.stringify({ mes, ano }) }),

  syncStatus: () => req('/sync-status'),
}
