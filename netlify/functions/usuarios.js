const { neon } = require('@neondatabase/serverless');
const jwt = require('jsonwebtoken');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Content-Type': 'application/json',
};

function verificarAuth(event) {
  const auth = (event.headers.authorization || event.headers.Authorization || '').replace('Bearer ', '');
  if (!auth) return null;
  try { return jwt.verify(auth, process.env.JWT_SECRET); } catch { return null; }
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };

  const userToken = verificarAuth(event);
  if (!userToken) return { statusCode: 401, headers: CORS, body: JSON.stringify({ erro: 'Não autenticado' }) };
  if (userToken.perfil !== 'admin') return { statusCode: 403, headers: CORS, body: JSON.stringify({ erro: 'Acesso restrito a administradores' }) };

  const sql = neon(process.env.DATABASE_URL);

  try {
    // GET — listar usuários
    if (event.httpMethod === 'GET') {
      const rows = await sql`
        SELECT email, nome, perfil FROM efetivo_usuarios ORDER BY nome
      `;
      return { statusCode: 200, headers: CORS, body: JSON.stringify(rows) };
    }

    // POST — criar usuário
    if (event.httpMethod === 'POST') {
      const { email, nome, senha, perfil } = JSON.parse(event.body || '{}');
      if (!email || !nome || !senha) return { statusCode: 400, headers: CORS, body: JSON.stringify({ erro: 'email, nome e senha são obrigatórios' }) };

      await sql`
        INSERT INTO efetivo_usuarios (email, nome, senha, perfil)
        VALUES (${email.toLowerCase().trim()}, ${nome.trim()}, ${senha}, ${perfil || 'user'})
      `;
      return { statusCode: 201, headers: CORS, body: JSON.stringify({ ok: true }) };
    }

    // PATCH — editar usuário
    if (event.httpMethod === 'PATCH') {
      const { email, nome, senha, perfil } = JSON.parse(event.body || '{}');
      if (!email) return { statusCode: 400, headers: CORS, body: JSON.stringify({ erro: 'email é obrigatório' }) };

      if (senha) {
        await sql`UPDATE efetivo_usuarios SET nome=${nome}, senha=${senha}, perfil=${perfil} WHERE email=${email}`;
      } else {
        await sql`UPDATE efetivo_usuarios SET nome=${nome}, perfil=${perfil} WHERE email=${email}`;
      }
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true }) };
    }

    // DELETE — remover usuário
    if (event.httpMethod === 'DELETE') {
      const { email } = JSON.parse(event.body || '{}');
      if (!email) return { statusCode: 400, headers: CORS, body: JSON.stringify({ erro: 'email é obrigatório' }) };
      if (email === userToken.email) return { statusCode: 400, headers: CORS, body: JSON.stringify({ erro: 'Você não pode excluir sua própria conta' }) };

      await sql`DELETE FROM efetivo_usuarios WHERE email = ${email}`;
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 405, headers: CORS, body: JSON.stringify({ erro: 'Método não permitido' }) };
  } catch (e) {
    console.error('usuarios error:', e);
    if (e.message?.includes('duplicate key')) return { statusCode: 409, headers: CORS, body: JSON.stringify({ erro: 'E-mail já cadastrado' }) };
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ erro: 'Erro interno do servidor' }) };
  }
};
