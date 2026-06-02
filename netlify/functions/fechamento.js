const { neon } = require('@neondatabase/serverless');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };

  const sql = neon(process.env.DATABASE_URL);

  try {
    if (event.httpMethod === 'GET') {
      const p   = event.queryStringParameters || {};
      const mes = Number(p.mes);
      const ano = Number(p.ano);
      const rows = await sql`SELECT id FROM efetivo_fechamento WHERE mes = ${mes} AND ano = ${ano}`;
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ fechado: rows.length > 0 }) };
    }

    if (event.httpMethod === 'POST') {
      const { mes, ano } = JSON.parse(event.body || '{}');
      if (!mes || !ano)
        return { statusCode: 400, headers: CORS, body: JSON.stringify({ erro: 'mes e ano obrigatórios' }) };

      await sql`
        INSERT INTO efetivo_fechamento (mes, ano, fechado_por)
        VALUES (${mes}, ${ano}, 'sistema')
        ON CONFLICT (mes, ano) DO NOTHING
      `;
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 405, headers: CORS, body: JSON.stringify({ erro: 'Método não permitido' }) };
  } catch (e) {
    console.error('fechamento error:', e);
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ erro: 'Erro ao processar fechamento' }) };
  }
};
