/**
 * setup-neon.js — Cria as tabelas no Neon DB e insere dados iniciais.
 * Execute uma vez: node setup-neon.js
 */
const { neon } = require('@neondatabase/serverless');

const DATABASE_URL = process.env.DATABASE_URL ||
  'postgresql://neondb_owner:npg_8TjMkDCfmpZ1@ep-withered-grass-apqd000p-pooler.c-7.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

const sql = neon(DATABASE_URL);

async function main() {
  console.log('🔧 Criando tabelas no Neon...');

  await sql`
    CREATE TABLE IF NOT EXISTS efetivo_usuarios (
      email   TEXT PRIMARY KEY,
      nome    TEXT NOT NULL,
      senha   TEXT NOT NULL,
      perfil  TEXT NOT NULL DEFAULT 'user'
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS efetivo_projetos (
      codigo TEXT PRIMARY KEY,
      nome   TEXT NOT NULL,
      ativo  BOOLEAN DEFAULT true
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS efetivo_relogios (
      relogio        TEXT PRIMARY KEY,
      descricao      TEXT,
      codigo_projeto TEXT REFERENCES efetivo_projetos(codigo)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS efetivo_funcionarios (
      matricula      TEXT PRIMARY KEY,
      nome           TEXT,
      funcao         TEXT,
      codigo_projeto TEXT,
      situacao       TEXT,
      dt_admissao    DATE,
      dt_demissao    DATE,
      tipo_contrato  TEXT,
      synced_at      TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS efetivo_presenca (
      id             BIGSERIAL PRIMARY KEY,
      matricula      TEXT NOT NULL,
      data           DATE NOT NULL,
      codigo_projeto TEXT,
      fonte          TEXT NOT NULL CHECK (fonte IN ('ponto', 'manual')),
      usuario_input  TEXT,
      created_at     TIMESTAMPTZ DEFAULT NOW(),
      updated_at     TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (matricula, data)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS efetivo_fechamento (
      id          BIGSERIAL PRIMARY KEY,
      mes         INTEGER NOT NULL,
      ano         INTEGER NOT NULL,
      fechado_em  TIMESTAMPTZ DEFAULT NOW(),
      fechado_por TEXT,
      UNIQUE (mes, ano)
    )
  `;

  console.log('✅ Tabelas criadas!');

  // Usuário admin
  await sql`
    INSERT INTO efetivo_usuarios (email, nome, senha, perfil)
    VALUES ('thiego.silva@rttshop.com.br', 'Thiego Silva', 'rtt2026', 'admin')
    ON CONFLICT (email) DO NOTHING
  `;
  console.log('✅ Usuário admin inserido!');

  // Projetos
  await sql`
    INSERT INTO efetivo_projetos (codigo, nome) VALUES
      ('ADM-ATI',   'ADM Atibaia'),
      ('183',       'Petrobras REVAP'),
      ('43',        'Vale S11D'),
      ('CARAJAS',   'Vale Carajás'),
      ('HYDRO',     'Hydro Paragominas'),
      ('ADM-RJ',    'ADM Rio de Janeiro'),
      ('74',        'CSN UPV Volta Redonda'),
      ('TABG',      'TABG IDAG/IRED'),
      ('141-ITA',   'Ultracargo Itaquatiara'),
      ('159',       'Vale Porto Norte'),
      ('ALUMAR',    'Alumar'),
      ('UTE',       'UTE Canoas'),
      ('208',       'Petrobras REFAP'),
      ('141',       'Ultracargo Suape'),
      ('194',       'Transpetro Suape'),
      ('GALPAO-PE', 'Galpão PE'),
      ('ANSA',      'ANSA Paraná'),
      ('ALTO-RN',   'Alto do Rodrigues RN'),
      ('214',       'Brava RN'),
      ('HOCHS',     'Hochschild GO')
    ON CONFLICT (codigo) DO NOTHING
  `;
  console.log('✅ Projetos inseridos!');

  // Relógios
  await sql`
    INSERT INTO efetivo_relogios (relogio, descricao, codigo_projeto) VALUES
      ('001', 'SP-ATIBAIA ADM',   'ADM-ATI'),
      ('002', 'SP-ATIBAIA FAB',   'ADM-ATI'),
      ('003', 'SP-SJC_REVAP 01',  '183'),
      ('004', 'SP-SJC_REVAP 02',  '183'),
      ('005', 'SP-SJC_REVAP 03',  '183'),
      ('006', 'SP-SJC_REVAP 04',  '183'),
      ('007', 'SP-SJC_REVAP 05',  '183'),
      ('008', 'SP-SJC_REVAP 06',  '183'),
      ('101', 'PA-S11D_NU1',      '43'),
      ('102', 'PA-S11D_USINA15',  '43'),
      ('103', 'PA-S11D_MINA 14',  '43'),
      ('104', 'PA-CARAJAS',       'CARAJAS'),
      ('105', 'PA-S11D_MINA 14',  '43'),
      ('106', 'PA-GALPAO_CANAA',  '43'),
      ('107', 'PA-HYDRO FABRIC',  'HYDRO'),
      ('201', 'RJ-ADM_NU',        'ADM-RJ'),
      ('202', 'RJ-VR_SINTER',     '74'),
      ('203', 'RJ-VR_VULCA',      '74'),
      ('204', 'RJ-VR_DESPOEIRA',  '74'),
      ('205', 'RJ-TABG IDAG',     'TABG'),
      ('206', 'RJ-TABG IRED',     'TABG'),
      ('301', 'MA-UC_ITAQ CANT',  '141-ITA'),
      ('302', 'MA-UC_ITAQ ESCR',  '141-ITA'),
      ('303', 'MA-VLPORTO OFIC',  '159'),
      ('304', 'MA-ALUMAR_ID_NU',  'ALUMAR'),
      ('305', 'MA-VL PORTO NT',   '159'),
      ('401', 'RS-UTE CANOAS 1',  'UTE'),
      ('402', 'RS-UTE CANOAS 2',  'UTE'),
      ('403', 'RS-REFAP 1',       '208'),
      ('404', 'RS-REFAP 2',       '208'),
      ('405', 'RS-REFAP 3',       '208'),
      ('406', 'RS-REFAP 6',       '208'),
      ('407', 'RS-REFAP 4',       '208'),
      ('408', 'RS-REFAP 5',       '208'),
      ('501', 'PE-UC_SUAPE',      '141'),
      ('502', 'PE-TRANSP SUAPE',  '194'),
      ('503', 'PE-TRANSP SUAP2',  '194'),
      ('504', 'PE-GALPÃO',        'GALPAO-PE'),
      ('601', 'PR_ANSA',          'ANSA'),
      ('701', 'RN-ALTO_RODRIG',   'ALTO-RN'),
      ('702', 'RN-BRAVA',         '214'),
      ('801', 'GO-HOCHSCHILD',    'HOCHS')
    ON CONFLICT (relogio) DO NOTHING
  `;
  console.log('✅ Relógios inseridos!');
  console.log('\n🎉 Neon DB configurado com sucesso!');
}

main().catch(e => { console.error('❌ Erro:', e.message); process.exit(1); });
