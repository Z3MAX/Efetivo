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
      const mes = parseInt(p.mes || new Date().getMonth() + 1);
      const ano = parseInt(p.ano || new Date().getFullYear());
      const proj = p.projeto || '';
      const mesStr = String(mes).padStart(2, '0');
      const de  = `${ano}-${mesStr}-01`;
      const ate = `${ano}-${mesStr}-31`;

      let rows;
      if (proj) {
        rows = await sql`
          SELECT p.matricula, p.data::text, p.codigo_projeto, p.fonte
          FROM efetivo_presenca p
          INNER JOIN efetivo_funcionarios f ON p.matricula = f.matricula
          WHERE p.data >= ${de}::date AND p.data <= ${ate}::date
            AND f.codigo_projeto = ${proj}
          ORDER BY p.data, p.matricula
        `;
      } else {
        rows = await sql`
          SELECT matricula, data::text, codigo_projeto, fonte
          FROM efetivo_presenca
          WHERE data >= ${de}::date AND data <= ${ate}::date
          ORDER BY data, matricula
        `;
      }
      return { statusCode: 200, headers: CORS, body: JSON.stringify(rows) };
    }

    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { matricula, data, fonte, codigo_projeto } = body;

      if (!matricula || !data)
        return { statusCode: 400, headers: CORS, body: JSON.stringify({ erro: 'matricula e data obrigatórios' }) };

      // Verificar fechamento
      const [anoN, mesN] = data.split('-').map(Number);
      const fechado = await sql`SELECT id FROM efetivo_fechamento WHERE mes = ${mesN} AND ano = ${anoN}`;
      if (fechado.length)
        return { statusCode: 403, headers: CORS, body: JSON.stringify({ erro: 'Mês fechado. Edição bloqueada.' }) };

      if (!fonte) {
        // Remover presença
        await sql`DELETE FROM efetivo_presenca WHERE matricula = ${matricula} AND data = ${data}::date`;
      } else {
        // Upsert presença
        await sql`
          INSERT INTO efetivo_presenca (matricula, data, codigo_projeto, fonte, updated_at)
          VALUES (${matricula}, ${data}::date, ${codigo_projeto || null}, ${fonte}, NOW())
          ON CONFLICT (matricula, data) DO UPDATE SET
            fonte          = EXCLUDED.fonte,
            codigo_projeto = COALESCE(EXCLUDED.codigo_projeto, efetivo_presenca.codigo_projeto),
            updated_at     = NOW()
        `;
      }
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 405, headers: CORS, body: JSON.stringify({ erro: 'Método não permitido' }) };
  } catch (e) {
    console.error('presencas error:', e);
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ erro: 'Erro ao processar presenças' }) };
  }
};
