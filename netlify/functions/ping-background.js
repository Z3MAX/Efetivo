// Teste mínimo: background function sem xlsx — escreve no banco para confirmar execução
const { neon } = require('@neondatabase/serverless')

exports.handler = async (event) => {
  try {
    const db = neon(process.env.DATABASE_URL)
    await db`CREATE TABLE IF NOT EXISTS efetivo_sync_status (id INT PRIMARY KEY, status TEXT NOT NULL, detalhe JSONB, iniciado_at TIMESTAMPTZ DEFAULT NOW(), finalizado_at TIMESTAMPTZ)`
    await db`INSERT INTO efetivo_sync_status (id, status, detalhe, iniciado_at, finalizado_at) VALUES (1, 'ping-ok', ${'{"teste":true}'}::jsonb, NOW(), NOW()) ON CONFLICT (id) DO UPDATE SET status='ping-ok', detalhe=EXCLUDED.detalhe, finalizado_at=NOW()`
  } catch(e) {
    console.error('[ping-bg] erro:', e.message)
  }
}
