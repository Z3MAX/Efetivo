const { neon } = require('@neondatabase/serverless');
const jwt = require('jsonwebtoken');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  if (event.httpMethod !== 'POST')
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ erro: 'Método não permitido' }) };

  try {
    const { email, senha } = JSON.parse(event.body || '{}');
    if (!email || !senha)
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ erro: 'E-mail e senha obrigatórios' }) };

    const sql = neon(process.env.DATABASE_URL);
    const rows = await sql`
      SELECT email, nome, perfil
      FROM efetivo_usuarios
      WHERE email = ${email.toLowerCase().trim()} AND senha = ${senha}
    `;

    if (!rows.length)
      return { statusCode: 401, headers: CORS, body: JSON.stringify({ erro: 'E-mail ou senha incorretos.' }) };

    const user = rows[0];
    const token = jwt.sign(
      { email: user.email, nome: user.nome, perfil: user.perfil },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    return { statusCode: 200, headers: CORS, body: JSON.stringify({ token, user }) };
  } catch (e) {
    console.error('login error:', e);
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ erro: 'Erro interno do servidor' }) };
  }
};
