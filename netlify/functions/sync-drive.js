/**
 * sync-drive.js — Baixa o Excel do Google Drive e atualiza o banco.
 * POST /api/sync-drive  { mes, ano }
 * Variáveis de ambiente necessárias:
 *   GOOGLE_SERVICE_ACCOUNT_JSON  — JSON completo da service account
 *   GOOGLE_DRIVE_FOLDER_ID       — ID da pasta no Google Drive
 */
const { neon } = require('@neondatabase/serverless')
const jwt     = require('jsonwebtoken')
const XLSX    = require('xlsx')

const JWT_SECRET = process.env.JWT_SECRET || 'efetivo-rtt-2026'

// ── Auth ──────────────────────────────────────────────────────────
function verifyToken(event) {
  const auth = (event.headers?.authorization || event.headers?.Authorization || '')
  const token = auth.replace('Bearer ', '').trim()
  if (!token) return null
  try { return jwt.verify(token, JWT_SECRET) } catch { return null }
}

function ok(body, status = 200) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type,Authorization' },
    body: JSON.stringify(body),
  }
}
function err(msg, status = 400) { return ok({ erro: msg }, status) }

// ── Google Drive auth via service account ─────────────────────────
async function getGoogleAccessToken() {
  const sa = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON)
  const now = Math.floor(Date.now() / 1000)
  const assertion = jwt.sign(
    { iss: sa.client_email, scope: 'https://www.googleapis.com/auth/drive.readonly',
      aud: 'https://oauth2.googleapis.com/token', exp: now + 3600, iat: now },
    sa.private_key, { algorithm: 'RS256' }
  )
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${assertion}`,
  })
  const data = await res.json()
  if (!data.access_token) throw new Error(`Google Auth falhou: ${JSON.stringify(data)}`)
  return data.access_token
}

// ── Lista arquivos xlsx na pasta ──────────────────────────────────
async function listarArquivos(token, folderId) {
  const q = encodeURIComponent(`'${folderId}' in parents and mimeType='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' and trashed=false`)
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,modifiedTime)&orderBy=modifiedTime+desc`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  const data = await res.json()
  return data.files || []
}

// ── Baixa arquivo como Buffer ─────────────────────────────────────
async function baixarArquivo(token, fileId) {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (!res.ok) throw new Error(`Erro ao baixar arquivo: ${res.status}`)
  const ab = await res.arrayBuffer()
  return Buffer.from(ab)
}

// ── Shared strings ────────────────────────────────────────────────
function parseSharedStrings(ssXml) {
  const strings = []
  const re = /<si>([\s\S]*?)<\/si>/g
  let m
  while ((m = re.exec(ssXml)) !== null) {
    const ts = m[1].match(/<t[^>]*>([\s\S]*?)<\/t>/g)
    strings.push(ts ? ts.map(t => t.replace(/<\/?t[^>]*>/g, '')).join('') : '')
  }
  return strings
}

// ── Parse serial de data Excel ────────────────────────────────────
function parseSerial(s) {
  if (!s) return null
  const n = parseInt(s)
  if (!n || n < 1000 || n > 100000) return null
  // Excel epoch: 1899-12-30
  const d = new Date((n - 1) * 86400000 + new Date('1899-12-30').getTime())
  if (isNaN(d.getTime()) || d.getFullYear() < 1900 || d.getFullYear() > 2100) return null
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`
}

function parseDate(val) {
  if (!val) return null
  const s = String(val).trim()
  if (/^\d{4,6}$/.test(s)) return parseSerial(s)
  const m1 = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  if (m1) return `${m1[3]}-${m1[2]}-${m1[1]}`
  const m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m2) return m2[0]
  return null
}

// ── Mapeia CC → projeto ───────────────────────────────────────────
function mapProjeto(codCC, descCC) {
  const MAP = { '183':'183','208':'208','43':'43','159':'159','194':'194','141':'141','214':'214','74':'74','4.300':'43','1.701':'141' }
  const cc = String(codCC||'').trim().replace(/\s+/g,'')
  if (MAP[cc]) return MAP[cc]
  const num = cc.match(/^(\d+)/)?.[1]
  if (num && MAP[num]) return MAP[num]
  const d = String(descCC||'').toUpperCase()
  if (d.includes('REVAP')||d.includes('183')) return '183'
  if (d.includes('REFAP')||d.includes('208')) return '208'
  if (d.includes('S11D')||d.includes('43')) return '43'
  if (d.includes('PORTO NORTE')||d.includes('159')) return '159'
  if (d.includes('TRANSPETRO')||d.includes('194')) return '194'
  if (d.includes('ULTRACARGO')||d.includes('141')) return '141'
  if (d.includes('BRAVA')||d.includes('214')) return '214'
  if (d.includes('CSN')||d.includes('74')) return '74'
  return null
}

function mapSituacao(sit) {
  const s = String(sit||'').toUpperCase()
  if (s.includes('DEMIT')||s.includes('RESCIS')) return 'Demitido'
  if (s.includes('FÉRIAS')||s.includes('FERIAS')) return 'Ferias'
  if (s.includes('AFASTADO')||s.includes('LICENÇA')||s.includes('AUSENTE')) return 'Ausente'
  return 'Ativo'
}

// ── Parser XML do sheet ───────────────────────────────────────────
const HEADERS = ['Filial','Matrícula','Nome','Data Admissão','Situação Folha','Data Demissão',
  'Função','Cod Centro de Custo','Desc Centro de Custo','Data Apontamento','Dia_semana',
  'Observação','1E','1S','2E','2S','Jornada 1','Jornada 2','Intervalo','Jornada Total',
  'Atestado Medico','Total ADN','Total HE','Total Atraso','Total Faltas',
  'Cod_ Abono','Desc_ Abono','Férias','1E-Relogio','1S-Relogio','2E-Relogio','2S-Relogio']

function colName(n) {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  return n < 26 ? A[n] : A[Math.floor(n/26)-1] + A[n%26]
}

const COL_MAP = {}
HEADERS.forEach((h, i) => { COL_MAP[colName(i)] = h })

function parseSheetXML(buf, strings) {
  const rows = []
  let pos = 0
  const len = buf.length
  let skipFirst = true

  function findStr(start, tag) {
    const needle = Buffer.from(tag)
    for (let i = start; i <= len - needle.length; i++) {
      let ok = true
      for (let j = 0; j < needle.length; j++) { if (buf[i+j] !== needle[j]) { ok = false; break } }
      if (ok) return i
    }
    return -1
  }

  while (pos < len) {
    const rs = findStr(pos, '<row ')
    if (rs === -1) break
    const re = findStr(rs, '</row>')
    if (re === -1) break
    const rowXml = buf.slice(rs, re+6).toString('utf8')
    pos = re + 6
    if (skipFirst) { skipFirst = false; continue }

    const cells = {}
    const cellRe = /<c r="([A-Z]+)\d+"([^>]*)>(?:<v>([\s\S]*?)<\/v>)?/g
    let cm
    while ((cm = cellRe.exec(rowXml)) !== null) {
      const col = cm[1], attrs = cm[2]||'', raw = cm[3]
      if (raw == null) { cells[col] = null; continue }
      const tm = attrs.match(/t="([^"]*)"/)
      cells[col] = tm?.[1] === 's' ? (strings[parseInt(raw)] ?? null) : raw
    }

    const row = {}
    for (const [col, val] of Object.entries(cells)) {
      const h = COL_MAP[col]
      if (h) row[h] = val ? String(val).trim() : null
    }
    if (row['Matrícula']) rows.push(row)
  }
  return rows
}

// ── Bulk insert com UNNEST ────────────────────────────────────────
async function bulkInsertFuncionarios(db, funcs) {
  for (let i = 0; i < funcs.length; i += 500) {
    const chunk = funcs.slice(i, i + 500)
    await db`
      INSERT INTO efetivo_funcionarios
        (matricula, nome, funcao, codigo_projeto, situacao, dt_admissao, dt_demissao, synced_at)
      SELECT
        unnest(${chunk.map(f=>f.matricula)}::text[]),
        unnest(${chunk.map(f=>f.nome)}::text[]),
        unnest(${chunk.map(f=>f.funcao)}::text[]),
        unnest(${chunk.map(f=>f.codigo_projeto)}::text[]),
        unnest(${chunk.map(f=>f.situacao)}::text[]),
        unnest(${chunk.map(f=>f.dt_admissao)}::text[]),
        unnest(${chunk.map(f=>f.dt_demissao)}::text[]),
        NOW()
      ON CONFLICT (matricula) DO UPDATE SET
        nome=EXCLUDED.nome, funcao=EXCLUDED.funcao, codigo_projeto=EXCLUDED.codigo_projeto,
        situacao=EXCLUDED.situacao, dt_admissao=EXCLUDED.dt_admissao,
        dt_demissao=EXCLUDED.dt_demissao, synced_at=NOW()
    `
  }
}

async function bulkInsertPresencas(db, pres) {
  for (let i = 0; i < pres.length; i += 1000) {
    const chunk = pres.slice(i, i + 1000)
    await db`
      INSERT INTO efetivo_presenca (matricula, data, codigo_projeto, fonte, usuario_input)
      SELECT
        unnest(${chunk.map(r=>r.matricula)}::text[]),
        unnest(${chunk.map(r=>r.data)}::text[]),
        unnest(${chunk.map(r=>r.proj)}::text[]),
        unnest(${chunk.map(r=>r.fonte)}::text[]),
        'sync_drive'
      ON CONFLICT (matricula, data) DO UPDATE SET
        codigo_projeto=EXCLUDED.codigo_projeto,
        fonte=EXCLUDED.fonte,
        updated_at=NOW()
    `
  }
}

async function bulkInsertAbonos(db, abonos) {
  for (let i = 0; i < abonos.length; i += 1000) {
    const chunk = abonos.slice(i, i + 1000)
    await db`
      INSERT INTO efetivo_abonos (matricula, data, cod_abono, synced_at)
      SELECT
        unnest(${chunk.map(r=>r.matricula)}::text[]),
        unnest(${chunk.map(r=>r.data)}::text[]),
        unnest(${chunk.map(r=>r.cod)}::text[]),
        NOW()
      ON CONFLICT (matricula, data) DO UPDATE SET cod_abono=EXCLUDED.cod_abono, synced_at=NOW()
    `
  }
}

// ── Handler ───────────────────────────────────────────────────────
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Methods':'POST,OPTIONS', 'Access-Control-Allow-Headers':'Content-Type,Authorization' }, body:'' }
  }
  if (event.httpMethod !== 'POST') return err('Método não permitido', 405)

  const usuario = verifyToken(event)
  if (!usuario) return err('Não autenticado', 401)
  if (usuario.perfil !== 'admin') return err('Apenas administradores podem sincronizar', 403)

  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) return err('GOOGLE_SERVICE_ACCOUNT_JSON não configurado', 500)
  if (!process.env.GOOGLE_DRIVE_FOLDER_ID) return err('GOOGLE_DRIVE_FOLDER_ID não configurado', 500)

  const body = event.body ? JSON.parse(event.body) : {}
  const mes  = parseInt(body.mes) || new Date().getMonth() + 1
  const ano  = parseInt(body.ano) || new Date().getFullYear()
  const de   = `${ano}-${String(mes).padStart(2,'0')}-01`
  const diasMes = new Date(ano, mes, 0).getDate()
  const ate  = `${ano}-${String(mes).padStart(2,'0')}-${String(diasMes).padStart(2,'0')}`

  try {
    // 1. Auth Google
    const token = await getGoogleAccessToken()

    // 2. Lista arquivos
    const files = await listarArquivos(token, process.env.GOOGLE_DRIVE_FOLDER_ID)
    if (!files.length) return err('Nenhum arquivo .xlsx encontrado na pasta do Drive')
    const arquivo = files[0] // mais recente

    // 3. Baixa o arquivo
    const buf = await baixarArquivo(token, arquivo.id)

    // 4. Parse Excel
    const wb = XLSX.read(buf, { type: 'buffer', bookFiles: true })
    const ssBuf    = wb.files['xl/sharedStrings.xml']?.content
    const sheetBuf = wb.files['xl/worksheets/sheet1.xml']?.content
    if (!ssBuf || !sheetBuf) return err('Formato de arquivo inválido (sem sharedStrings ou sheet1)')

    const strings  = parseSharedStrings(ssBuf.toString('utf8'))
    const allRows  = parseSheetXML(sheetBuf, strings)

    // 5. Filtra pelo mês solicitado
    const rows = allRows.filter(r => {
      const d = parseDate(r['Data Apontamento'])
      return !d || (d >= de && d <= ate)
    })

    // 6. Monta datasets
    const funcsMap = new Map()
    for (const r of allRows) { // funcionários = todos, não filtrar por mês
      const mat = String(r['Matrícula']||'').trim()
      if (!mat || funcsMap.has(mat)) continue
      funcsMap.set(mat, {
        matricula: mat, nome: r['Nome']||null, funcao: r['Função']||null,
        codigo_projeto: mapProjeto(r['Cod Centro de Custo'], r['Desc Centro de Custo']),
        situacao: mapSituacao(r['Situação Folha']),
        dt_admissao: parseDate(r['Data Admissão']),
        dt_demissao: parseDate(r['Data Demissão']),
      })
    }

    const presRows = []
    for (const r of rows) {
      const mat  = String(r['Matrícula']||'').trim()
      const data = parseDate(r['Data Apontamento'])
      if (!mat || !data) continue
      presRows.push({
        matricula: mat, data,
        proj: mapProjeto(r['Cod Centro de Custo'], r['Desc Centro de Custo']),
        fonte: (r['1E-Relogio']||r['1S-Relogio']) ? 'ponto' : 'manual',
      })
    }

    const abonosRows = rows
      .filter(r => r['Cod_ Abono'] && r['Matrícula'] && r['Data Apontamento'])
      .map(r => ({
        matricula: String(r['Matrícula']).trim(),
        data: parseDate(r['Data Apontamento']),
        cod: String(r['Cod_ Abono']).trim(),
      })).filter(r => r.data)

    // 7. Persiste
    const db    = neon(process.env.DATABASE_URL)
    const funcs = [...funcsMap.values()]
    await bulkInsertFuncionarios(db, funcs)
    await bulkInsertPresencas(db, presRows)
    await bulkInsertAbonos(db, abonosRows)

    return ok({
      ok: true,
      arquivo: arquivo.name,
      modificado: arquivo.modifiedTime,
      funcionarios: funcs.length,
      presencas: presRows.length,
      abonos: abonosRows.length,
    })
  } catch (e) {
    console.error('[sync-drive]', e)
    return err(`Erro na sincronização: ${e.message}`, 500)
  }
}
