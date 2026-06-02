const { neon } = require('@neondatabase/serverless');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };

  try {
    const sql = neon(process.env.DATABASE_URL);
    const p   = event.queryStringParameters || {};
    const mes = parseInt(p.mes || new Date().getMonth() + 1);
    const ano = parseInt(p.ano || new Date().getFullYear());
    const mesStr = String(mes).padStart(2, '0');
    const de  = `${ano}-${mesStr}-01`;
    const ate = `${ano}-${mesStr}-31`;

    const rows = await sql`
      SELECT matricula, data::text, cod_abono
      FROM efetivo_abonos
      WHERE data >= ${de}::date AND data <= ${ate}::date
      ORDER BY data, matricula
    `;

    return { statusCode: 200, headers: CORS, body: JSON.stringify(rows) };
  } catch (e) {
    console.error('abonos error:', e);
    // Retorna array vazio se tabela não existir ainda
    return { statusCode: 200, headers: CORS, body: JSON.stringify([]) };
  }
};
