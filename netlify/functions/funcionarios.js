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
    const mes = parseInt(p.mes  || new Date().getMonth() + 1);
    const ano = parseInt(p.ano  || new Date().getFullYear());
    const proj = p.projeto || '';

    const mesStr = String(mes).padStart(2, '0');
    const de  = `${ano}-${mesStr}-01`;
    const ate = `${ano}-${mesStr}-31`;

    let rows;
    if (proj) {
      rows = await sql`
        SELECT matricula, nome, funcao, codigo_projeto, situacao,
               dt_admissao::text, dt_demissao::text, tipo_contrato
        FROM efetivo_funcionarios
        WHERE (
          situacao IN ('Ativo','Ausente','Ferias','Intermitente')
          OR (situacao = 'Demitido' AND dt_demissao >= ${de}::date AND dt_demissao <= ${ate}::date)
        )
        AND codigo_projeto = ${proj}
        ORDER BY nome
      `;
    } else {
      rows = await sql`
        SELECT matricula, nome, funcao, codigo_projeto, situacao,
               dt_admissao::text, dt_demissao::text, tipo_contrato
        FROM efetivo_funcionarios
        WHERE (
          situacao IN ('Ativo','Ausente','Ferias','Intermitente')
          OR (situacao = 'Demitido' AND dt_demissao >= ${de}::date AND dt_demissao <= ${ate}::date)
        )
        ORDER BY nome
      `;
    }

    return { statusCode: 200, headers: CORS, body: JSON.stringify(rows) };
  } catch (e) {
    console.error('funcionarios error:', e);
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ erro: 'Erro ao buscar funcionários' }) };
  }
};
