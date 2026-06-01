-- ================================================================
-- Efetivo RTT — Migration Supabase
-- Execute no SQL Editor do seu projeto Supabase
-- ================================================================

-- 1. Projetos (códigos RTT)
CREATE TABLE IF NOT EXISTS efetivo_projetos (
  codigo TEXT PRIMARY KEY,          -- ex: '183', '43', '208'
  nome   TEXT NOT NULL,
  ativo  BOOLEAN DEFAULT true
);

-- 2. De-para: relógio fixo → projeto
CREATE TABLE IF NOT EXISTS efetivo_relogios (
  relogio          TEXT PRIMARY KEY,   -- P0_RELOGIO do TOTVS
  descricao        TEXT,               -- P0_DESC
  codigo_projeto   TEXT REFERENCES efetivo_projetos(codigo)
);

-- 3. Funcionários (sincronizado do SQL Server)
CREATE TABLE IF NOT EXISTS efetivo_funcionarios (
  matricula        TEXT PRIMARY KEY,
  nome             TEXT,
  funcao           TEXT,
  codigo_projeto   TEXT,
  situacao         TEXT,              -- Ativo, Ausente, Ferias, Demitido
  dt_admissao      DATE,
  dt_demissao      DATE,
  synced_at        TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Presenças por dia (auto via ponto + manual)
CREATE TABLE IF NOT EXISTS efetivo_presenca (
  id              BIGSERIAL PRIMARY KEY,
  matricula       TEXT NOT NULL,
  data            DATE NOT NULL,
  codigo_projeto  TEXT,
  fonte           TEXT NOT NULL CHECK (fonte IN ('ponto', 'manual')),
  usuario_input   TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (matricula, data)
);

-- 5. Fechamento de mês
CREATE TABLE IF NOT EXISTS efetivo_fechamento (
  id          BIGSERIAL PRIMARY KEY,
  mes         INTEGER NOT NULL,
  ano         INTEGER NOT NULL,
  fechado_em  TIMESTAMPTZ DEFAULT NOW(),
  fechado_por TEXT,
  UNIQUE (mes, ano)
);

-- ================================================================
-- Dados: relógios → projetos (conforme mapeamento TOTVS)
-- ================================================================

INSERT INTO efetivo_projetos (codigo, nome) VALUES
  ('ADM-ATI',  'ADM Atibaia'),
  ('183',      'Petrobras REVAP'),
  ('43',       'Vale S11D'),
  ('CARAJAS',  'Vale Carajás'),
  ('HYDRO',    'Hydro Paragominas'),
  ('ADM-RJ',   'ADM Rio de Janeiro'),
  ('74',       'CSN UPV Volta Redonda'),
  ('TABG',     'TABG IDAG/IRED'),
  ('141-ITA',  'Ultracargo Itaquatiara'),
  ('159',      'Vale Porto Norte'),
  ('ALUMAR',   'Alumar'),
  ('UTE',      'UTE Canoas'),
  ('208',      'Petrobras REFAP'),
  ('141',      'Ultracargo Suape'),
  ('194',      'Transpetro Suape'),
  ('GALPAO-PE','Galpão PE'),
  ('ANSA',     'ANSA Paraná'),
  ('ALTO-RN',  'Alto do Rodrigues RN'),
  ('214',      'Brava RN'),
  ('HOCHS',    'Hochschild GO')
ON CONFLICT (codigo) DO NOTHING;

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
ON CONFLICT (relogio) DO NOTHING;

-- ================================================================
-- RLS: habilite autenticação por usuário se necessário
-- Por ora, permissão aberta para usuários autenticados
-- ================================================================
ALTER TABLE efetivo_projetos    ENABLE ROW LEVEL SECURITY;
ALTER TABLE efetivo_relogios    ENABLE ROW LEVEL SECURITY;
ALTER TABLE efetivo_funcionarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE efetivo_presenca    ENABLE ROW LEVEL SECURITY;
ALTER TABLE efetivo_fechamento  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_read"  ON efetivo_projetos     FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read"  ON efetivo_relogios     FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read"  ON efetivo_funcionarios FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_all"   ON efetivo_presenca     FOR ALL    TO authenticated USING (true);
CREATE POLICY "auth_all"   ON efetivo_fechamento   FOR ALL    TO authenticated USING (true);

-- Sync script precisa de service_role key (bypass RLS)
