// Teste mínimo: background function sem xlsx
const { neon } = require('@neondatabase/serverless')
const jwt = require('jsonwebtoken')

exports.handler = async (event) => {
  console.log('[ping-bg] iniciado', event.httpMethod)
  try {
    const db = neon(process.env.DATABASE_URL)
    await db`SELECT 1 AS ok`
    console.log('[ping-bg] DB ok')
  } catch(e) {
    console.error('[ping-bg] DB erro:', e.message)
  }
}
