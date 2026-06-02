const { neon } = require('@neondatabase/serverless');
const jwt = require('jsonwebtoken');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json',
};

function verificarToken(event) {
  const auth = (event.headers.authorization || event.headers.Authorization || '').replace('Bearer ', '');
  if (!auth) return null;
  try { return jwt.verify(auth, process.env.JWT_SECRET); } catch { return null; }
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };

  const user = verificarToken(event);
  if (!user) return { statusCode: 401, headers: CORS, body: JSON.stringify({ erro: 'Não autenticado' }) };

  try {
    const sql = neon(process.env.DATABASE_URL);
    const params = event.queryStringParameters || {};
    const projeto = params.projeto || '';

    let rows;
    if (projeto) {
      rows = await sql`
        SELECT matricula, nome, funcao, codigo_projeto, situacao, dt_admissao, dt_demissao, tipo_contrato
        FROM efetivo_funcionarios
        WHERE situacao IN ('Ativo', 'Ausente', 'Ferias')
          AND codigo_projeto = ${projeto}
        ORDER BY nome
      `;
    } else {
      rows = await sql`
        SELECT matricula, nome, funcao, codigo_projeto, situacao, dt_admissao, dt_demissao, tipo_contrato
        FROM efetivo_funcionarios
        WHERE situacao IN ('Ativo', 'Ausente', 'Ferias')
        ORDER BY nome
      `;
    }

    return { statusCode: 200, headers: CORS, body: JSON.stringify(rows) };
  } catch (e) {
    console.error('funcionarios error:', e);
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ erro: 'Erro ao buscar funcionários' }) };
  }
};
