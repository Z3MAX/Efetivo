// Teste com xlsx — verifica se o require funciona em background function
const { neon } = require('@neondatabase/serverless')
let xlsxOk = false
try {
  require('xlsx')
  xlsxOk = true
} catch(e) {
  xlsxOk = false
}

exports.handler = async (event) => {
  try {
    const db = neon(process.env.DATABASE_URL)
    await db`INSERT INTO efetivo_sync_status (id, status, detalhe, iniciado_at, finalizado_at) VALUES (1, ${xlsxOk ? 'xlsx-ok' : 'xlsx-erro'}, ${'{"xlsxOk":' + xlsxOk + '}'}::jsonb, NOW(), NOW()) ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status, detalhe=EXCLUDED.detalhe, finalizado_at=NOW()`
  } catch(e) {
    console.error('[ping-bg] erro:', e.message)
  }
}
