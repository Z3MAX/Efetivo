const { neon } = require('@neondatabase/serverless');
const jwt = require('jsonwebtoken');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json',
};

function verificarAuth(event) {
  const auth = (event.headers.authorization || event.headers.Authorization || '').replace('Bearer ', '');
  if (!auth) return null;
  try { return jwt.verify(auth, process.env.JWT_SECRET); } catch { return null; }
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  if (!verificarAuth(event)) return { statusCode: 401, headers: CORS, body: JSON.stringify({ erro: 'Não autenticado' }) };

  try {
    const sql  = neon(process.env.DATABASE_URL);
    const p    = event.queryStringParameters || {};
    const proj = p.projeto || '';

    let rows;
    if (proj) {
      rows = await sql`
        SELECT a.matricula, a.dt_inicio::text, a.dt_fim::text
        FROM efetivo_ausencias a
        INNER JOIN efetivo_funcionarios f ON a.matricula = f.matricula
        WHERE f.codigo_projeto = ${proj}
        ORDER BY a.matricula, a.dt_inicio
      `;
    } else {
      rows = await sql`
        SELECT matricula, dt_inicio::text, dt_fim::text
        FROM efetivo_ausencias
        ORDER BY matricula, dt_inicio
      `;
    }

    return { statusCode: 200, headers: CORS, body: JSON.stringify(rows) };
  } catch (e) {
    console.error('ausencias error:', e);
    // Retorna array vazio se tabela não existir ainda
    return { statusCode: 200, headers: CORS, body: JSON.stringify([]) };
  }
};
