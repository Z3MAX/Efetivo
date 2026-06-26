/**
 * api.js — Netlify Function que serve todas as rotas /api/*
 * Conecta ao Neon DB via @neondatabase/serverless
 * Auth via JWT armazenado no localStorage do React
 */
const { neon } = require('@neondatabase/serverless')
const jwt = require('jsonwebtoken')

const JWT_SECRET = process.env.JWT_SECRET || 'efetivo-rtt-2026'

function getDb() {
  return neon(process.env.DATABASE_URL)
}

function verifyToken(event) {
  const auth = (event.headers && (event.headers.authorization || event.headers.Authorization)) || ''
  const token = auth.replace('Bearer ', '').trim()
  if (!token) return null
  try {
    return jwt.verify(token, JWT_SECRET)
  } catch {
    return null
  }
}

function ok(body, status = 200) {
  return {
    statusCode: status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
    body: JSON.stringify(body),
  }
}

function err(msg, status = 400) {
  return ok({ erro: msg }, status)
}

exports.handler = async (event) => {
  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      },
      body: '',
    }
  }

  const raw = event.path || ''
  // Normaliza path: remove prefixo /.netlify/functions/api ou /api
  const path = raw
    .replace(/^\/.netlify\/functions\/api/, '')
    .replace(/^\/api/, '')
    || '/'

  const method = event.httpMethod
  const qs = event.queryStringParameters || {}
  const body = event.body ? JSON.parse(event.body) : {}

  // ── Login (rota pública) ────────────────────────────────────────────
  if (path === '/login' && method === 'POST') {
    const { email, senha } = body
    if (!email || !senha) return err('Campos obrigatórios ausentes.', 400)

    const db = getDb()
    const rows = await db`
      SELECT email, nome, senha, perfil
      FROM efetivo_usuarios
      WHERE email = ${email.toLowerCase().trim()}
    `
    const user = rows[0]
    if (!user || user.senha !== senha) return err('E-mail ou senha incorretos.', 401)

    const token = jwt.sign(
      { email: user.email, nome: user.nome, perfil: user.perfil },
      JWT_SECRET,
      { expiresIn: '8h' }
    )
    return ok({ token, user: { email: user.email, nome: user.nome, perfil: user.perfil } })
  }

  // ── Todas as demais rotas exigem autenticação ───────────────────────
  const usuario = verifyToken(event)
  if (!usuario) return err('não autenticado', 401)

  const db = getDb()

  // ── GET /projetos ───────────────────────────────────────────────────
  if (path === '/projetos' && method === 'GET') {
    const rows = await db`
      SELECT codigo, nome FROM efetivo_projetos WHERE ativo = true ORDER BY codigo
    `
    return ok(rows)
  }

  // ── GET /funcionarios ───────────────────────────────────────────────
  if (path === '/funcionarios' && method === 'GET') {
    const { projeto = '', busca = '', mes, ano } = qs
    const mesN = parseInt(mes) || new Date().getMonth() + 1
    const anoN = parseInt(ano) || new Date().getFullYear()
    const de   = `${anoN}-${String(mesN).padStart(2,'0')}-01`
    const diasMes = new Date(anoN, mesN, 0).getDate()
    const ate  = `${anoN}-${String(mesN).padStart(2,'0')}-${String(diasMes).padStart(2,'0')}`
    const buscaLike = `%${busca}%`

    let rows
    if (projeto && busca) {
      rows = await db`
        SELECT DISTINCT f.matricula, f.nome, f.funcao, f.codigo_projeto,
                        f.situacao, f.dt_admissao, f.dt_demissao, f.tipo_contrato
        FROM efetivo_funcionarios f
        WHERE (f.situacao IN ('Ativo','Ausente','Ferias')
          OR (f.situacao = 'Demitido' AND f.dt_demissao BETWEEN ${de} AND ${ate}))
        AND (f.codigo_projeto = ${projeto}
          OR f.matricula IN (
            SELECT DISTINCT matricula FROM efetivo_presenca
            WHERE codigo_projeto = ${projeto} AND data BETWEEN ${de} AND ${ate}
          ))
        AND (f.nome ILIKE ${buscaLike} OR f.matricula ILIKE ${buscaLike})
        ORDER BY f.nome
      `
    } else if (projeto) {
      rows = await db`
        SELECT DISTINCT f.matricula, f.nome, f.funcao, f.codigo_projeto,
                        f.situacao, f.dt_admissao, f.dt_demissao, f.tipo_contrato
        FROM efetivo_funcionarios f
        WHERE (f.situacao IN ('Ativo','Ausente','Ferias')
          OR (f.situacao = 'Demitido' AND f.dt_demissao BETWEEN ${de} AND ${ate}))
        AND (f.codigo_projeto = ${projeto}
          OR f.matricula IN (
            SELECT DISTINCT matricula FROM efetivo_presenca
            WHERE codigo_projeto = ${projeto} AND data BETWEEN ${de} AND ${ate}
          ))
        ORDER BY f.nome
      `
    } else if (busca) {
      rows = await db`
        SELECT matricula, nome, funcao, codigo_projeto, situacao,
               dt_admissao, dt_demissao, tipo_contrato
        FROM efetivo_funcionarios
        WHERE (situacao IN ('Ativo','Ausente','Ferias')
          OR (situacao = 'Demitido' AND dt_demissao BETWEEN ${de} AND ${ate}))
        AND (nome ILIKE ${buscaLike} OR matricula ILIKE ${buscaLike})
        ORDER BY nome
      `
    } else {
      rows = await db`
        SELECT matricula, nome, funcao, codigo_projeto, situacao,
               dt_admissao, dt_demissao, tipo_contrato
        FROM efetivo_funcionarios
        WHERE situacao IN ('Ativo','Ausente','Ferias')
           OR (situacao = 'Demitido' AND dt_demissao BETWEEN ${de} AND ${ate})
        ORDER BY nome
      `
    }
    return ok(rows)
  }

  // ── GET /presencas ──────────────────────────────────────────────────
  if (path === '/presencas' && method === 'GET') {
    const mesN = parseInt(qs.mes) || new Date().getMonth() + 1
    const anoN = parseInt(qs.ano) || new Date().getFullYear()
    const proj = qs.projeto || ''
    const de   = `${anoN}-${String(mesN).padStart(2,'0')}-01`
    const diasMes = new Date(anoN, mesN, 0).getDate()
    const ate  = `${anoN}-${String(mesN).padStart(2,'0')}-${String(diasMes).padStart(2,'0')}`

    let rows
    if (proj) {
      rows = await db`
        SELECT p.matricula, p.data, p.codigo_projeto, p.fonte
        FROM efetivo_presenca p
        INNER JOIN efetivo_funcionarios f ON p.matricula = f.matricula
        WHERE p.data BETWEEN ${de} AND ${ate}
          AND f.codigo_projeto = ${proj}
      `
    } else {
      rows = await db`
        SELECT matricula, data, codigo_projeto, fonte
        FROM efetivo_presenca
        WHERE data BETWEEN ${de} AND ${ate}
      `
    }
    return ok(rows)
  }

  // ── POST /presencas ─────────────────────────────────────────────────
  if (path === '/presencas' && method === 'POST') {
    const { matricula, data, codigo_projeto } = body
    if (!matricula || !data) return err('matricula e data obrigatórios')

    const mesN = parseInt(data.split('-')[1])
    const anoN = parseInt(data.split('-')[0])
    if (await mesFechado(db, mesN, anoN)) return err('Mês fechado. Edição bloqueada.', 403)

    await db`
      INSERT INTO efetivo_presenca (matricula, data, codigo_projeto, fonte, usuario_input, updated_at)
      VALUES (${matricula}, ${data}, ${codigo_projeto || null}, 'manual', ${usuario.email}, NOW())
      ON CONFLICT (matricula, data) DO UPDATE SET
        codigo_projeto = EXCLUDED.codigo_projeto,
        fonte          = 'manual',
        usuario_input  = EXCLUDED.usuario_input,
        updated_at     = NOW()
    `
    return ok({ ok: true })
  }

  // ── POST /presencas/bulk ────────────────────────────────────────────
  if (path === '/presencas/bulk' && method === 'POST') {
    const { registros = [], sobrescrever = false } = body
    if (!registros.length) return err('Nenhum registro enviado.')

    // Verifica fechamento por mês
    const meses = new Set(registros.map(r => `${r.data.split('-')[1]}/${r.data.split('-')[0]}`))
    for (const m of meses) {
      const [mesS, anoS] = m.split('/')
      if (await mesFechado(db, parseInt(mesS), parseInt(anoS)))
        return err(`Mês ${m} está fechado. Edição bloqueada.`, 403)
    }

    let inseridos = 0, ignorados = 0
    const erros = []
    for (const r of registros) {
      const { matricula, data, codigo_projeto } = r
      if (!matricula || !data) { erros.push({ registro: r, erro: 'matricula ou data ausente' }); continue }
      try {
        if (sobrescrever) {
          await db`
            INSERT INTO efetivo_presenca (matricula, data, codigo_projeto, fonte, usuario_input, updated_at)
            VALUES (${matricula}, ${data}, ${codigo_projeto || null}, 'manual', ${usuario.email}, NOW())
            ON CONFLICT (matricula, data) DO UPDATE SET
              codigo_projeto = EXCLUDED.codigo_projeto,
              fonte          = 'manual',
              usuario_input  = EXCLUDED.usuario_input,
              updated_at     = NOW()
          `
          inseridos++
        } else {
          const res = await db`
            INSERT INTO efetivo_presenca (matricula, data, codigo_projeto, fonte, usuario_input)
            VALUES (${matricula}, ${data}, ${codigo_projeto || null}, 'manual', ${usuario.email})
            ON CONFLICT (matricula, data) DO NOTHING
          `
          if (res.length > 0 || res.count > 0) inseridos++
          else ignorados++
        }
      } catch (e) {
        erros.push({ matricula, data, erro: e.message })
      }
    }
    return ok({ inseridos, ignorados, erros })
  }

  // ── GET /abonos ─────────────────────────────────────────────────────
  if (path === '/abonos' && method === 'GET') {
    const mesN = parseInt(qs.mes) || new Date().getMonth() + 1
    const anoN = parseInt(qs.ano) || new Date().getFullYear()
    const de   = `${anoN}-${String(mesN).padStart(2,'0')}-01`
    const diasMes = new Date(anoN, mesN, 0).getDate()
    const ate  = `${anoN}-${String(mesN).padStart(2,'0')}-${String(diasMes).padStart(2,'0')}`
    const rows = await db`
      SELECT matricula, data, cod_abono FROM efetivo_abonos
      WHERE data BETWEEN ${de} AND ${ate}
    `
    return ok(rows)
  }

  // ── GET /ausencias ──────────────────────────────────────────────────
  if (path === '/ausencias' && method === 'GET') {
    const mesN = parseInt(qs.mes) || new Date().getMonth() + 1
    const anoN = parseInt(qs.ano) || new Date().getFullYear()
    const de   = `${anoN}-${String(mesN).padStart(2,'0')}-01`
    const diasMes = new Date(anoN, mesN, 0).getDate()
    const ate  = `${anoN}-${String(mesN).padStart(2,'0')}-${String(diasMes).padStart(2,'0')}`

    const totvs = await db`
      SELECT a.matricula, a.dt_inicio, a.dt_fim, f.situacao, 'totvs' AS fonte
      FROM efetivo_ausencias a
      LEFT JOIN efetivo_funcionarios f ON a.matricula = f.matricula
      WHERE a.dt_inicio <= ${ate} AND a.dt_fim >= ${de}
    `
    const manual = await db`
      SELECT a.matricula, a.dt_inicio, a.dt_fim,
             COALESCE(f.situacao, 'Ausente') AS situacao, 'manual' AS fonte
      FROM efetivo_ausencias_manual a
      LEFT JOIN efetivo_funcionarios f ON a.matricula = f.matricula
      WHERE a.dt_inicio <= ${ate} AND a.dt_fim >= ${de}
    `
    const matsManual = new Set(manual.map(r => r.matricula))
    const combined = [...manual, ...totvs.filter(r => !matsManual.has(r.matricula))]
    return ok(combined)
  }

  // ── GET /ausencias/manual ───────────────────────────────────────────
  if (path === '/ausencias/manual' && method === 'GET') {
    const { projeto = '', busca = '' } = qs
    const buscaLike = `%${busca}%`
    let rows
    if (projeto && busca) {
      rows = await db`
        SELECT m.id, m.matricula, f.nome, f.funcao, f.codigo_projeto,
               m.dt_inicio, m.dt_fim, m.motivo, m.usuario_input, m.created_at
        FROM efetivo_ausencias_manual m
        LEFT JOIN efetivo_funcionarios f ON m.matricula = f.matricula
        WHERE f.codigo_projeto = ${projeto}
          AND (f.nome ILIKE ${buscaLike} OR m.matricula ILIKE ${buscaLike})
        ORDER BY m.matricula, m.dt_inicio
      `
    } else if (projeto) {
      rows = await db`
        SELECT m.id, m.matricula, f.nome, f.funcao, f.codigo_projeto,
               m.dt_inicio, m.dt_fim, m.motivo, m.usuario_input, m.created_at
        FROM efetivo_ausencias_manual m
        LEFT JOIN efetivo_funcionarios f ON m.matricula = f.matricula
        WHERE f.codigo_projeto = ${projeto}
        ORDER BY m.matricula, m.dt_inicio
      `
    } else if (busca) {
      rows = await db`
        SELECT m.id, m.matricula, f.nome, f.funcao, f.codigo_projeto,
               m.dt_inicio, m.dt_fim, m.motivo, m.usuario_input, m.created_at
        FROM efetivo_ausencias_manual m
        LEFT JOIN efetivo_funcionarios f ON m.matricula = f.matricula
        WHERE f.nome ILIKE ${buscaLike} OR m.matricula ILIKE ${buscaLike}
        ORDER BY m.matricula, m.dt_inicio
      `
    } else {
      rows = await db`
        SELECT m.id, m.matricula, f.nome, f.funcao, f.codigo_projeto,
               m.dt_inicio, m.dt_fim, m.motivo, m.usuario_input, m.created_at
        FROM efetivo_ausencias_manual m
        LEFT JOIN efetivo_funcionarios f ON m.matricula = f.matricula
        ORDER BY m.matricula, m.dt_inicio
      `
    }
    return ok(rows)
  }

  // ── POST /ausencias/manual ──────────────────────────────────────────
  if (path === '/ausencias/manual' && method === 'POST') {
    const registros = Array.isArray(body) ? body : [body]
    let inseridos = 0
    const erros = []
    for (const r of registros) {
      try {
        await db`
          INSERT INTO efetivo_ausencias_manual (matricula, dt_inicio, dt_fim, motivo, usuario_input)
          VALUES (${r.matricula}, ${r.dt_inicio}, ${r.dt_fim}, ${r.motivo || ''}, ${usuario.email})
          ON CONFLICT (matricula, dt_inicio) DO UPDATE SET
            dt_fim        = EXCLUDED.dt_fim,
            motivo        = EXCLUDED.motivo,
            usuario_input = EXCLUDED.usuario_input,
            created_at    = NOW()
        `
        inseridos++
      } catch (e) {
        erros.push({ matricula: r.matricula, erro: e.message })
      }
    }
    return ok({ inseridos, erros })
  }

  // ── DELETE /presencas/:matricula/:data ──────────────────────────────
  const matchDelPres = path.match(/^\/presencas\/([^/]+)\/(\d{4}-\d{2}-\d{2})$/)
  if (matchDelPres && method === 'DELETE') {
    const mat  = matchDelPres[1]
    const data = matchDelPres[2]
    const mesN = parseInt(data.split('-')[1])
    const anoN = parseInt(data.split('-')[0])
    if (await mesFechado(db, mesN, anoN)) return err('Mês fechado. Edição bloqueada.', 403)
    await db`DELETE FROM efetivo_presenca WHERE matricula = ${mat} AND data = ${data}`
    return ok({ ok: true })
  }

  // ── DELETE /ausencias/manual/:id ────────────────────────────────────
  const matchDelete = path.match(/^\/ausencias\/manual\/(\d+)$/)
  if (matchDelete && method === 'DELETE') {
    const id = parseInt(matchDelete[1])
    await db`DELETE FROM efetivo_ausencias_manual WHERE id = ${id}`
    return ok({ ok: true })
  }

  // ── GET /atestados ──────────────────────────────────────────────────
  if (path === '/atestados' && method === 'GET') {
    const mesN = parseInt(qs.mes) || new Date().getMonth() + 1
    const anoN = parseInt(qs.ano) || new Date().getFullYear()
    const de   = `${anoN}-${String(mesN).padStart(2,'0')}-01`
    const diasMes = new Date(anoN, mesN, 0).getDate()
    const ate  = `${anoN}-${String(mesN).padStart(2,'0')}-${String(diasMes).padStart(2,'0')}`
    const rows = await db`
      SELECT matricula, data FROM efetivo_atestados WHERE data BETWEEN ${de} AND ${ate}
    `
    return ok(rows)
  }

  // ── GET /fechamento ─────────────────────────────────────────────────
  if (path === '/fechamento' && method === 'GET') {
    const mesN = parseInt(qs.mes)
    const anoN = parseInt(qs.ano)
    return ok({ fechado: await mesFechado(db, mesN, anoN) })
  }

  // ── POST /fechamento ────────────────────────────────────────────────
  if (path === '/fechamento' && method === 'POST') {
    const { mes, ano } = body
    await db`
      INSERT INTO efetivo_fechamento (mes, ano, fechado_por)
      VALUES (${mes}, ${ano}, ${usuario.email})
      ON CONFLICT (mes, ano) DO NOTHING
    `
    return ok({ ok: true })
  }

  // ── GET /sync-status ────────────────────────────────────────────────
  if (path === '/sync-status' && method === 'GET') {
    const [r] = await db`SELECT MAX(synced_at) AS ultima FROM efetivo_funcionarios`
    const [c] = await db`SELECT COUNT(*) AS total FROM efetivo_funcionarios`
    return ok({ ultima_sync: r?.ultima, total_funcionarios: Number(c?.total) })
  }

  // ── GET /fte-resumo ──────────────────────────────────────────────────
  if (path === '/fte-resumo' && method === 'GET') {
    const mesN = parseInt(qs.mes) || new Date().getMonth() + 1
    const anoN = parseInt(qs.ano) || new Date().getFullYear()
    const de   = `${anoN}-${String(mesN).padStart(2,'0')}-01`
    const diasMes = new Date(anoN, mesN, 0).getDate()
    const ate  = `${anoN}-${String(mesN).padStart(2,'0')}-${String(diasMes).padStart(2,'0')}`

    // Dias úteis do mês (seg-sex)
    let uteis = 0
    const totalDias = new Date(anoN, mesN, 0).getDate()
    for (let d = 1; d <= totalDias; d++) {
      const wd = new Date(anoN, mesN - 1, d).getDay()
      if (wd !== 0 && wd !== 6) uteis++
    }

    // HC por projeto + presencas SOMENTE em dias úteis (seg-sex) dos próprios funcionários do projeto
    const rows = await db`
      SELECT
        f.codigo_projeto,
        COUNT(DISTINCT f.matricula)::int                                       AS hc,
        COALESCE(SUM(pc.dias_uteis_presente), 0)::int                          AS dias_uteis_com_ponto
      FROM efetivo_funcionarios f
      LEFT JOIN (
        SELECT matricula,
               COUNT(DISTINCT data) AS dias_uteis_presente
        FROM efetivo_presenca
        WHERE data BETWEEN ${de} AND ${ate}
          AND EXTRACT(DOW FROM data) BETWEEN 1 AND 5
        GROUP BY matricula
      ) pc ON pc.matricula = f.matricula
      WHERE f.codigo_projeto IS NOT NULL
        AND (f.situacao IN ('Ativo','Ausente','Ferias')
          OR (f.situacao = 'Demitido' AND f.dt_demissao BETWEEN ${de} AND ${ate}))
      GROUP BY f.codigo_projeto
      ORDER BY f.codigo_projeto
    `

    const result = rows.map(r => {
      const maxDias = r.hc * uteis
      const presRate = maxDias > 0 ? Math.min(+(r.dias_uteis_com_ponto / maxDias * 100).toFixed(1), 100) : 0
      return {
        codigo_projeto: r.codigo_projeto,
        hc: r.hc,
        // FTE aproximado: HC × taxa de presença com ponto (sem EL — dashboard apenas)
        fte: +(r.hc * presRate / 100).toFixed(1),
        pres_rate: presRate,
        dias_uteis_com_ponto: r.dias_uteis_com_ponto,
        dias_uteis: uteis,
      }
    })

    return ok(result)
  }

  return err('Rota não encontrada', 404)
}

async function mesFechado(db, mes, ano) {
  const rows = await db`
    SELECT id FROM efetivo_fechamento WHERE mes = ${mes} AND ano = ${ano}
  `
  return rows.length > 0
}
