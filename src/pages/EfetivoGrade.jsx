import { useEffect, useState, useCallback } from 'react'
import { api } from '../lib/api'

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
               'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

function diasDoMes(ano, mes) {
  const total = new Date(ano, mes + 1, 0).getDate()
  return Array.from({ length: total }, (_, i) => i + 1)
}

function fimDeSemana(ano, mes, dia) {
  const d = new Date(ano, mes, dia).getDay()
  return d === 0 || d === 6
}

export default function EfetivoGrade({ user, onLogout }) {
  const hoje = new Date()
  const [ano, setAno]           = useState(hoje.getFullYear())
  const [mes, setMes]           = useState(hoje.getMonth())
  const [projetos, setProjetos] = useState([])
  const [filtroProjeto, setFiltroProjeto] = useState('')
  const [busca, setBusca]       = useState('')
  const [funcionarios, setFuncionarios] = useState([])
  const [presencas, setPresencas]       = useState({})
  const [editando, setEditando] = useState(null)
  const [salvando, setSalvando] = useState(false)
  const [fechado, setFechado]   = useState(false)
  const [sincronizando, setSincronizando] = useState(false)
  const [resultadoSync, setResultadoSync] = useState(null)

  const dias = diasDoMes(ano, mes)

  useEffect(() => {
    api.projetos().then(setProjetos).catch(console.error)
  }, [])

  useEffect(() => {
    api.fechamento({ mes: mes + 1, ano })
      .then(({ fechado }) => setFechado(fechado))
      .catch(console.error)
  }, [mes, ano])

  useEffect(() => {
    const params = { mes: mes + 1, ano }
    if (filtroProjeto) params.projeto = filtroProjeto
    api.funcionarios(params)
      .then(setFuncionarios)
      .catch(console.error)
  }, [filtroProjeto, mes, ano])

  const carregarPresencas = useCallback(() => {
    const params = { mes: mes + 1, ano }
    if (filtroProjeto) params.projeto = filtroProjeto
    api.presencas(params)
      .then(rows => {
        const mapa = {}
        rows.forEach(r => { mapa[`${r.matricula}-${r.data}`] = r })
        setPresencas(mapa)
      })
      .catch(console.error)
  }, [ano, mes, filtroProjeto])

  useEffect(() => { carregarPresencas() }, [carregarPresencas])

  async function salvarPresenca(matricula, dataStr, codigoProjeto) {
    if (fechado) return
    setSalvando(true)
    try {
      await api.salvarPresenca({ matricula, data: dataStr, codigo_projeto: codigoProjeto || null })
      await carregarPresencas()
    } catch (e) {
      alert(e.message)
    }
    setEditando(null)
    setSalvando(false)
  }

  async function sincronizarDrive() {
    if (!window.confirm(`Sincronizar dados de ${MESES[mes]}/${ano} com o Google Drive?`)) return
    setSincronizando(true)
    setResultadoSync(null)
    try {
      const r = await api.syncDrive(mes + 1, ano)
      setResultadoSync({ ok: true, ...r })
      await carregarPresencas()
    } catch (e) {
      setResultadoSync({ ok: false, erro: e.message })
    }
    setSincronizando(false)
  }

  async function fecharMes() {
    if (!window.confirm(`Fechar ${MESES[mes]}/${ano}? Isso bloqueará novas edições.`)) return
    try {
      await api.fecharMes(mes + 1, ano)
      setFechado(true)
    } catch (e) {
      alert(e.message)
    }
  }

  const funcsFiltradas = funcionarios.filter(f =>
    !busca || f.nome.toLowerCase().includes(busca.toLowerCase()) ||
    f.matricula.includes(busca)
  )

  return (
    <div style={s.root}>
      {/* Header */}
      <div style={s.header}>
        <span style={s.logo}>RTT · Efetivo</span>
        <div style={s.headerRight}>
          <span style={s.userEmail}>{user.email}</span>
          <button style={s.btnSair} onClick={onLogout}>Sair</button>
        </div>
      </div>

      {/* Filtros */}
      <div style={s.filtros}>
        <select style={s.select} value={mes} onChange={e => setMes(Number(e.target.value))}>
          {MESES.map((m, i) => <option key={i} value={i}>{m}</option>)}
        </select>
        <select style={s.select} value={ano} onChange={e => setAno(Number(e.target.value))}>
          {[2025, 2026, 2027].map(a => <option key={a}>{a}</option>)}
        </select>
        <select style={s.select} value={filtroProjeto} onChange={e => setFiltroProjeto(e.target.value)}>
          <option value="">Todos os projetos</option>
          {projetos.map(p => <option key={p.codigo} value={p.codigo}>{p.codigo} – {p.nome}</option>)}
        </select>
        <input style={s.busca} placeholder="Buscar funcionário..." value={busca}
          onChange={e => setBusca(e.target.value)} />
        <div style={{ flex: 1 }} />
        {user.perfil === 'admin' && (
          <button style={sincronizando ? s.btnSyncBusy : s.btnSync}
                  onClick={sincronizarDrive} disabled={sincronizando}>
            {sincronizando ? '⏳ Sincronizando...' : '☁ Sincronizar Drive'}
          </button>
        )}
        {fechado
          ? <span style={s.badgeFechado}>Mês fechado</span>
          : <button style={s.btnFechar} onClick={fecharMes}>Fechar {MESES[mes]}</button>}
      </div>

      {resultadoSync && (
        <div style={resultadoSync.ok ? s.alertOk : s.alertErr}>
          {resultadoSync.ok ? (
            <>
              <strong>✓ Sincronizado</strong> · Arquivo: <em>{resultadoSync.arquivo}</em>
              &nbsp;·&nbsp;{resultadoSync.funcionarios} funcionários
              &nbsp;·&nbsp;{resultadoSync.presencas} presenças
              &nbsp;·&nbsp;{resultadoSync.abonos} abonos
            </>
          ) : (
            <><strong>✗ Erro:</strong> {resultadoSync.erro}</>
          )}
          <button onClick={() => setResultadoSync(null)} style={s.btnFecharAlert}>✕</button>
        </div>
      )}

      {/* Grade */}
      <div style={s.gradeWrap}>
        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.thNome}>Funcionário</th>
              <th style={s.thFunc}>Função</th>
              {dias.map(d => (
                <th key={d} style={{ ...s.thDia, background: fimDeSemana(ano, mes, d) ? '#f5f5f5' : '#fff' }}>
                  {String(d).padStart(2,'0')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {funcsFiltradas.length === 0 && (
              <tr><td colSpan={dias.length + 2} style={{ padding: 24, textAlign: 'center', color: '#888' }}>
                Nenhum funcionário encontrado
              </td></tr>
            )}
            {funcsFiltradas.map(func => (
              <tr key={func.matricula} style={s.tr}>
                <td style={s.tdNome}>
                  <span style={s.mat}>{func.matricula}</span>
                  <span style={s.nome}>{func.nome}</span>
                </td>
                <td style={s.tdFunc}>{func.funcao}</td>
                {dias.map(d => {
                  const dataStr = `${ano}-${String(mes + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
                  const chave   = `${func.matricula}-${dataStr}`
                  const reg     = presencas[chave]
                  const isEdit  = editando === chave
                  const isWeekend = fimDeSemana(ano, mes, d)

                  return (
                    <td key={d} style={{ ...s.tdDia, background: isWeekend ? '#fafafa' : '#fff' }}
                        onClick={() => !fechado && !isEdit && setEditando(chave)}>
                      {isEdit ? (
                        <CelulaEdit
                          projetos={projetos}
                          valorAtual={reg?.codigo_projeto || ''}
                          onSalvar={cod => salvarPresenca(func.matricula, dataStr, cod)}
                          onCancelar={() => setEditando(null)}
                          salvando={salvando}
                        />
                      ) : reg?.codigo_projeto ? (
                        <span style={{ ...s.badge, background: reg.fonte === 'ponto' ? '#e6f4ea' : '#e8f0fe',
                          color: reg.fonte === 'ponto' ? '#1e6b3c' : '#1a56db' }}>
                          {reg.codigo_projeto}
                        </span>
                      ) : (
                        <span style={s.vazio}>{!fechado && !isWeekend ? '+' : ''}</span>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legenda */}
      <div style={s.legenda}>
        <span style={{ ...s.badge, background: '#e6f4ea', color: '#1e6b3c' }}>183</span> Automático (ponto) &nbsp;&nbsp;
        <span style={{ ...s.badge, background: '#e8f0fe', color: '#1a56db' }}>183</span> Manual &nbsp;&nbsp;
        <span style={s.vazio}>+</span> Sem registro — clique para preencher
      </div>
    </div>
  )
}

function CelulaEdit({ projetos, valorAtual, onSalvar, onCancelar, salvando }) {
  const [cod, setCod] = useState(valorAtual)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 90 }}
         onClick={e => e.stopPropagation()}>
      <select style={{ fontSize: 11, padding: '2px 4px', borderRadius: 4, border: '1px solid #aaa' }}
              value={cod} onChange={e => setCod(e.target.value)} autoFocus>
        <option value="">—</option>
        {projetos.map(p => <option key={p.codigo} value={p.codigo}>{p.codigo}</option>)}
      </select>
      <div style={{ display: 'flex', gap: 3 }}>
        <button style={s.btnOk} onClick={() => onSalvar(cod)} disabled={salvando}>✓</button>
        <button style={s.btnCancel} onClick={onCancelar}>✕</button>
      </div>
    </div>
  )
}

const s = {
  root: { minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#f0f2f5' },
  header: { background: '#c8000a', color: '#fff', padding: '0 24px', height: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 },
  logo: { fontWeight: 800, fontSize: 17, letterSpacing: 1 },
  headerRight: { display: 'flex', alignItems: 'center', gap: 14 },
  userEmail: { fontSize: 13, opacity: .85 },
  btnSair: { background: 'rgba(255,255,255,.2)', border: 'none', color: '#fff', padding: '5px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 13 },
  filtros: { display: 'flex', gap: 10, padding: '14px 24px', background: '#fff', borderBottom: '1px solid #e5e7eb', flexWrap: 'wrap', alignItems: 'center' },
  select: { padding: '7px 10px', borderRadius: 7, border: '1px solid #ddd', fontSize: 13, background: '#fff' },
  busca: { padding: '7px 10px', borderRadius: 7, border: '1px solid #ddd', fontSize: 13, minWidth: 200 },
  btnFechar: { background: '#c8000a', color: '#fff', border: 'none', padding: '7px 16px', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 600 },
  badgeFechado: { background: '#f1f1f1', color: '#666', padding: '6px 14px', borderRadius: 7, fontSize: 13 },
  gradeWrap: { flex: 1, overflow: 'auto', padding: '16px 24px' },
  table: { borderCollapse: 'collapse', fontSize: 12, background: '#fff', borderRadius: 8, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,.07)', minWidth: '100%' },
  thNome: { padding: '10px 12px', background: '#f8f9fa', textAlign: 'left', fontWeight: 600, whiteSpace: 'nowrap', borderBottom: '2px solid #e5e7eb', minWidth: 220, position: 'sticky', left: 0, zIndex: 2 },
  thFunc: { padding: '10px 12px', background: '#f8f9fa', textAlign: 'left', fontWeight: 600, whiteSpace: 'nowrap', borderBottom: '2px solid #e5e7eb', minWidth: 130 },
  thDia: { padding: '10px 6px', textAlign: 'center', fontWeight: 600, borderBottom: '2px solid #e5e7eb', minWidth: 48, borderLeft: '1px solid #f0f0f0' },
  tr: { borderBottom: '1px solid #f0f0f0' },
  tdNome: { padding: '8px 12px', whiteSpace: 'nowrap', background: '#fff', position: 'sticky', left: 0, zIndex: 1, borderRight: '1px solid #e5e7eb' },
  tdFunc: { padding: '8px 12px', color: '#666', whiteSpace: 'nowrap' },
  tdDia: { padding: '4px', textAlign: 'center', cursor: 'pointer', borderLeft: '1px solid #f0f0f0', verticalAlign: 'middle' },
  mat: { display: 'block', fontSize: 10, color: '#999' },
  nome: { display: 'block', fontWeight: 500 },
  badge: { display: 'inline-block', padding: '2px 7px', borderRadius: 5, fontWeight: 600, fontSize: 11 },
  vazio: { color: '#ccc', fontSize: 16 },
  legenda: { padding: '10px 24px', background: '#fff', borderTop: '1px solid #e5e7eb', fontSize: 12, color: '#555', display: 'flex', alignItems: 'center', gap: 6 },
  btnOk: { background: '#16a34a', color: '#fff', border: 'none', borderRadius: 4, padding: '2px 6px', cursor: 'pointer', fontSize: 12 },
  btnCancel: { background: '#dc2626', color: '#fff', border: 'none', borderRadius: 4, padding: '2px 6px', cursor: 'pointer', fontSize: 12 },
  btnSync: { background: '#1a56db', color: '#fff', border: 'none', padding: '7px 16px', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 600 },
  btnSyncBusy: { background: '#93aee0', color: '#fff', border: 'none', padding: '7px 16px', borderRadius: 7, cursor: 'not-allowed', fontSize: 13, fontWeight: 600 },
  alertOk: { margin: '0 24px 12px', padding: '10px 16px', background: '#ecfdf5', border: '1px solid #6ee7b7', borderRadius: 8, fontSize: 13, color: '#065f46', display: 'flex', alignItems: 'center', gap: 8 },
  alertErr: { margin: '0 24px 12px', padding: '10px 16px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, fontSize: 13, color: '#991b1b', display: 'flex', alignItems: 'center', gap: 8 },
  btnFecharAlert: { marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', fontSize: 15, color: 'inherit', opacity: .6 },
}
