/**
 * Função de setup único — cria tabelas e insere usuário admin.
 * Protegida por SETUP_SECRET env var.
 * Chamar uma vez: GET /.netlify/functions/setup?secret=<SETUP_SECRET>
 */
const { neon } = require('@neondatabase/serverless');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };

  const secret = (event.queryStringParameters || {}).secret || '';
  const expected = process.env.SETUP_SECRET || '';
  if (!expected || secret !== expected) {
    return { statusCode: 403, headers: CORS, body: JSON.stringify({ erro: 'Acesso negado' }) };
  }

  const dbUrl = process.env.DATABASE_URL || '';
  // Log masked URL for diagnosis
  const masked = dbUrl.replace(/:([^@]+)@/, ':***@');
  const log = [`DATABASE_URL host: ${masked}`];

  if (!dbUrl) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ erro: 'DATABASE_URL não configurado', log }) };
  }

  const sql = neon(dbUrl);

  try {
    // Teste básico de conectividade
    await sql`SELECT 1 AS ping`;
    log.push('conexao com Neon OK');

    // 1. Usuários
    await sql`
      CREATE TABLE IF NOT EXISTS efetivo_usuarios (
        id      SERIAL PRIMARY KEY,
        email   TEXT UNIQUE NOT NULL,
        nome    TEXT,
        senha   TEXT NOT NULL,
        perfil  TEXT NOT NULL DEFAULT 'usuario',
        criado_em TIMESTAMPTZ DEFAULT NOW()
      )
    `;
    log.push('tabela efetivo_usuarios OK');

    // 2. Projetos
    await sql`
      CREATE TABLE IF NOT EXISTS efetivo_projetos (
        codigo_projeto TEXT PRIMARY KEY,
        nome_projeto   TEXT,
        ativo          BOOLEAN DEFAULT TRUE
      )
    `;
    log.push('tabela efetivo_projetos OK');

    // 3. Relógios
    await sql`
      CREATE TABLE IF NOT EXISTS efetivo_relogios (
        id             SERIAL PRIMARY KEY,
        relogio_id     TEXT UNIQUE,
        descricao      TEXT,
        codigo_projeto TEXT REFERENCES efetivo_projetos(codigo_projeto)
      )
    `;
    log.push('tabela efetivo_relogios OK');

    // 4. Funcionários
    await sql`
      CREATE TABLE IF NOT EXISTS efetivo_funcionarios (
        matricula      TEXT PRIMARY KEY,
        nome           TEXT,
        funcao         TEXT,
        codigo_projeto TEXT,
        situacao       TEXT DEFAULT 'ativo',
        dt_admissao    DATE,
        dt_demissao    DATE
      )
    `;
    log.push('tabela efetivo_funcionarios OK');

    // 5. Presenças
    await sql`
      CREATE TABLE IF NOT EXISTS efetivo_presenca (
        id             SERIAL PRIMARY KEY,
        matricula      TEXT NOT NULL,
        data           DATE NOT NULL,
        codigo_projeto TEXT,
        fonte          TEXT,
        updated_at     TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(matricula, data)
      )
    `;
    log.push('tabela efetivo_presenca OK');

    // 6. Fechamento
    await sql`
      CREATE TABLE IF NOT EXISTS efetivo_fechamento (
        id         SERIAL PRIMARY KEY,
        mes        INTEGER NOT NULL,
        ano        INTEGER NOT NULL,
        fechado_em TIMESTAMPTZ DEFAULT NOW(),
        fechado_por TEXT,
        UNIQUE(mes, ano)
      )
    `;
    log.push('tabela efetivo_fechamento OK');

    // 7. Abonos
    await sql`
      CREATE TABLE IF NOT EXISTS efetivo_abonos (
        id        SERIAL PRIMARY KEY,
        matricula TEXT NOT NULL,
        data      DATE NOT NULL,
        cod_abono TEXT,
        UNIQUE(matricula, data)
      )
    `;
    log.push('tabela efetivo_abonos OK');

    // 8. Ausências
    await sql`
      CREATE TABLE IF NOT EXISTS efetivo_ausencias (
        id        SERIAL PRIMARY KEY,
        matricula TEXT NOT NULL,
        dt_inicio DATE NOT NULL,
        dt_fim    DATE NOT NULL
      )
    `;
    log.push('tabela efetivo_ausencias OK');

    // 9. Usuário admin inicial
    await sql`
      INSERT INTO efetivo_usuarios (email, nome, senha, perfil)
      VALUES ('thiego.silva@rttshop.com.br', 'Thiego Silva', 'rtt2026', 'admin')
      ON CONFLICT (email) DO NOTHING
    `;
    log.push('usuario admin inserido (ou ja existia)');

    // 10. Recriar projetos e relogios com schema correto (DROP CASCADE para limpar FKs antigas)
    await sql`DROP TABLE IF EXISTS efetivo_relogios CASCADE`;
    await sql`DROP TABLE IF EXISTS efetivo_projetos CASCADE`;

    await sql`
      CREATE TABLE efetivo_projetos (
        codigo_projeto TEXT PRIMARY KEY,
        nome_projeto   TEXT,
        ativo          BOOLEAN DEFAULT TRUE
      )
    `;
    log.push('tabela efetivo_projetos recriada');

    await sql`
      CREATE TABLE efetivo_relogios (
        id             SERIAL PRIMARY KEY,
        relogio_id     TEXT UNIQUE,
        descricao      TEXT,
        codigo_projeto TEXT REFERENCES efetivo_projetos(codigo_projeto)
      )
    `;
    log.push('tabela efetivo_relogios recriada');

    // 11. Projetos base
    const projetos = [
      ['183','Petrobras REVAP'],['208','Petrobras REFAP'],
      ['43','Vale S11D'],['159','Vale Porto Norte'],
      ['194','Transpetro Suape'],['141','Ultracargo Suape'],
      ['225','Hydro Alunorte'],['214','Brava RN'],
      ['74','CSN UPV Mecanica'],['135','CSN UPV Vulcanizacao'],
      ['131','CSN UPV Despoeiramento']
    ];
    for (const [cod, nome] of projetos) {
      await sql`
        INSERT INTO efetivo_projetos (codigo_projeto, nome_projeto, ativo)
        VALUES (${cod}, ${nome}, true)
      `;
    }
    log.push(`${projetos.length} projetos inseridos`);

    return {
      statusCode: 200, headers: CORS,
      body: JSON.stringify({ ok: true, log })
    };
  } catch (e) {
    console.error('setup error:', e);
    return {
      statusCode: 500, headers: CORS,
      body: JSON.stringify({ erro: e.message, log })
    };
  }
};
