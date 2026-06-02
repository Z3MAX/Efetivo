const BASE = '/.netlify/functions';

function getToken() {
  return localStorage.getItem('efetivo_token');
}

async function apiFetch(path, options = {}) {
  const token = getToken();
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.erro || `Erro HTTP ${res.status}`);
  return data;
}

export const api = {
  login:          (email, senha) => apiFetch('/login', { method: 'POST', body: JSON.stringify({ email, senha }) }),
  projetos:       ()             => apiFetch('/projetos'),
  funcionarios:   (params = {})  => apiFetch('/funcionarios?' + new URLSearchParams(params)),
  presencas:      (params = {})  => apiFetch('/presencas?' + new URLSearchParams(params)),
  salvarPresenca: (body)         => apiFetch('/presencas', { method: 'POST', body: JSON.stringify(body) }),
  fechamento:     (params = {})  => apiFetch('/fechamento?' + new URLSearchParams(params)),
  fecharMes:      (body)         => apiFetch('/fechamento', { method: 'POST', body: JSON.stringify(body) }),
};
