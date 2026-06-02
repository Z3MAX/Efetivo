const { neon } = require('@neondatabase/serverless');
const jwt = require('jsonwebtoken');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json',
};

function verificarToken(event) {
  const auth = (event.headers.authorization || event.headers.Authorization || '').replace('Bearer ', '');
  if (!auth) return null;
  try { return jwt.verify(auth, process.env.JWT_SECRET); } catch { return null; }
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };

  const userToken = verificarToken(event);
  if (!userToken) return { statusCode: 401, headers: CORS, body: JSON.stringify({ erro: 'Não autenticado' }) };

  const sql = neon(process.env.DATABASE_URL);

  try {
    if (event.httpMethod === 'GET') {
      const params = event.queryStringParameters || {};
      const mes = params.mes || new Date().getMonth() + 1;
      const ano = params.ano || new Date().getFullYear();
      const mesStr = String(mes).padStart(2, '0');
      const de  = `${ano}-${mesStr}-01`;
      const ate = `${ano}-${mesStr}-31`;

      const rows = await sql`
        SELECT matricula, data, codigo_projeto, fonte
        FROM efetivo_presenca
        WHERE data >= ${de}::date AND data <= ${ate}::date
        ORDER BY data, matricula
      `;
      return { statusCode: 200, headers: CORS, body: JSON.stringify(rows) };
    }

    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { matricula, data, codigo_projeto } = body;
      if (!matricula || !data)
        return { statusCode: 400, headers: CORS, body: JSON.stringify({ erro: 'matricula e data obrigatórios' }) };

      // Verificar se mês está fechado
      const [ano, mes] = data.split('-').map(Number);
      const fechado = await sql`
        SELECT id FROM efetivo_fechamento WHERE mes = ${mes} AND ano = ${ano}
      `;
      if (fechado.length)
        return { statusCode: 403, headers: CORS, body: JSON.stringify({ erro: 'Mês fechado. Edição bloqueada.' }) };

      await sql`
        INSERT INTO efetivo_presenca (matricula, data, codigo_projeto, fonte, usuario_input, updated_at)
        VALUES (${matricula}, ${data}::date, ${codigo_projeto || null}, 'manual', ${userToken.email}, NOW())
        ON CONFLICT (matricula, data) DO UPDATE SET
          codigo_projeto = EXCLUDED.codigo_projeto,
          fonte          = 'manual',
          usuario_input  = EXCLUDED.usuario_input,
          updated_at     = NOW()
      `;
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 405, headers: CORS, body: JSON.stringify({ erro: 'Método não permitido' }) };
  } catch (e) {
    console.error('presencas error:', e);
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ erro: 'Erro ao processar presenças' }) };
  }
};
