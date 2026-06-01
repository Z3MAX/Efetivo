"""
sync_ponto.py — Sincroniza SQL Server (TOTVS) → SQLite local.

Fonte principal de ponto/abono: RTT_APONTAMENTOS_RH
  → Uma linha por colaborador por dia (incluindo FDS sem atividade)
  → Contém presença (relógio), abono, férias, HE e faltas na mesma linha

Uso:
    python sync_ponto.py --mes 4 --ano 2026
    python sync_ponto.py --mes 4 --ano 2026 --so-func
    python sync_ponto.py --mes 4 --ano 2026 --so-ponto
"""
import argparse, sqlite3, os
from datetime import date, timedelta
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))

_db_path = os.getenv('DB_PATH', 'efetivo.db')
DB = os.path.join(os.path.dirname(__file__), _db_path)

_SQL_SERVER   = os.getenv('SQL_SERVER',   '191.243.199.169')
_SQL_PORT     = int(os.getenv('SQL_PORT', '15000'))
_SQL_DATABASE = os.getenv('SQL_DATABASE', 'DATALAKERTT001')
_SQL_USER     = os.getenv('SQL_USER',     '')
_SQL_PASSWORD = os.getenv('SQL_PASSWORD', '')

SQL_CONN_STR = (
    f"DRIVER={{ODBC Driver 18 for SQL Server}};"
    f"SERVER={_SQL_SERVER},{_SQL_PORT}\\RTTSQLEXCEL001;"
    f"DATABASE={_SQL_DATABASE};"
    f"UID={_SQL_USER};"
    f"PWD={_SQL_PASSWORD};"
    "TrustServerCertificate=yes;"
)

def carregar_mapeamento_relogios():
    """Le o de-para relogio->projeto direto do SQLite."""
    conn = sqlite3.connect(DB)
    rows = conn.execute(
        "SELECT relogio, codigo_projeto FROM efetivo_relogios WHERE codigo_projeto IS NOT NULL"
    ).fetchall()
    conn.close()
    return {r[0].strip(): r[1] for r in rows}

# ── Queries cadastrais (RTT_SERV_LISTFUNCV2) ──────────────────────────────────

SQL_FUNCIONARIOS = """
WITH ranked AS (
    SELECT
        LTRIM(RTRIM(RA_MAT))  AS matricula,
        LTRIM(RTRIM(RA_NOME)) AS nome,
        LTRIM(RTRIM(FUNCAO))  AS funcao,
        LTRIM(RTRIM(LEFT(PROJETO, CHARINDEX(' ', PROJETO + ' ') - 1))) AS codigo_projeto,
        SITUACAO AS situacao,
        CONVERT(VARCHAR(10), DT_ADMISSAO, 120) AS dt_admissao,
        CONVERT(VARCHAR(10), DT_DEMISSAO, 120) AS dt_demissao,
        LTRIM(RTRIM(TIPO_CONTRATO)) AS tipo_contrato,
        ROW_NUMBER() OVER (
            PARTITION BY RA_MAT
            ORDER BY CASE SITUACAO
                WHEN 'Ativo'   THEN 0 WHEN 'Ausente' THEN 1
                WHEN 'Ferias'  THEN 2 ELSE 3 END,
            DT_ADMISSAO DESC
        ) AS rn
    FROM RTT_SERV_LISTFUNCV2
)
SELECT matricula, nome, funcao, codigo_projeto, situacao, dt_admissao, dt_demissao, tipo_contrato
FROM ranked
WHERE rn = 1 AND situacao IN ('Ativo','Ausente','Ferias')
"""

SQL_DEMISSOES = """
SELECT DISTINCT
    LTRIM(RTRIM(RA_MAT))                       AS matricula,
    CONVERT(VARCHAR(10), DT_DEMISSAO, 120)     AS dt_demissao
FROM RTT_SERV_LISTFUNCV2
WHERE SITUACAO = 'Demitido'
  AND DT_DEMISSAO > '2000-01-01'
"""

SQL_DEMITIDOS_MES = """
WITH ranked AS (
    SELECT
        LTRIM(RTRIM(RA_MAT))  AS matricula,
        LTRIM(RTRIM(RA_NOME)) AS nome,
        LTRIM(RTRIM(FUNCAO))  AS funcao,
        LTRIM(RTRIM(LEFT(PROJETO, CHARINDEX(' ', PROJETO + ' ') - 1))) AS codigo_projeto,
        'Demitido'            AS situacao,
        CONVERT(VARCHAR(10), DT_ADMISSAO, 120) AS dt_admissao,
        CONVERT(VARCHAR(10), DT_DEMISSAO, 120) AS dt_demissao,
        LTRIM(RTRIM(TIPO_CONTRATO)) AS tipo_contrato,
        ROW_NUMBER() OVER (PARTITION BY RA_MAT ORDER BY DT_DEMISSAO DESC) AS rn
    FROM RTT_SERV_LISTFUNCV2
    WHERE SITUACAO = 'Demitido'
      AND DT_DEMISSAO >= %s AND DT_DEMISSAO < %s
)
SELECT matricula, nome, funcao, codigo_projeto, situacao, dt_admissao, dt_demissao, tipo_contrato
FROM ranked WHERE rn = 1
"""

SQL_AUSENCIAS = """
SELECT DISTINCT
    LTRIM(RTRIM(RA_MAT))                         AS matricula,
    CONVERT(VARCHAR(10), Ausente_DTinicial, 120) AS dt_inicio,
    CASE
        WHEN Ausente_dtfinal > '2000-01-01'
        THEN CONVERT(VARCHAR(10), Ausente_dtfinal, 120)
        ELSE '2099-12-31'
    END                                          AS dt_fim
FROM RTT_SERV_LISTFUNCV2
WHERE Ausente_DTinicial IS NOT NULL
  AND Ausente_DTinicial > '2000-01-01'
"""

SQL_PROJETOS = """
SELECT DISTINCT
    LTRIM(RTRIM(LEFT(PROJETO, CHARINDEX(' ', PROJETO + ' ') - 1))) AS codigo,
    LTRIM(RTRIM(PROJETO)) AS nome
FROM RTT_SERV_LISTFUNCV2
WHERE SITUACAO IN ('Ativo','Ausente','Ferias')
  AND PROJETO IS NOT NULL
  AND LTRIM(RTRIM(PROJETO)) <> ''
  AND LTRIM(RTRIM(LEFT(PROJETO, CHARINDEX(' ', PROJETO + ' ') - 1))) NOT IN ('#N/D', '')
"""

# ── Query principal de apontamentos (RTT_APONTAMENTOS_RH) ────────────────────
# Uma linha por colaborador por dia — inclui presença, abono, férias e HE

SQL_APONTAMENTOS = """
SELECT
    LTRIM(RTRIM([Matrícula]))                               AS matricula,
    CONVERT(VARCHAR(10), [Data Apontamento], 120)           AS data,
    -- Relógio: prefere entrada principal (1E), fallback para segunda entrada (2E)
    COALESCE(
        NULLIF(LTRIM(RTRIM([1E-Relogio])), ''),
        NULLIF(LTRIM(RTRIM([2E-Relogio])), '')
    )                                                       AS relogio,
    LTRIM(RTRIM(ISNULL([Cod_ Abono], '')))                  AS cod_abono,
    CASE WHEN LTRIM(RTRIM(ISNULL([Férias], ''))) <> ''
         THEN 1 ELSE 0 END                                  AS is_ferias,
    CASE WHEN LTRIM(RTRIM(ISNULL([Atestado Medico], ''))) <> ''
         THEN 1 ELSE 0 END                                  AS is_atestado,
    LTRIM(RTRIM(ISNULL([Total HE], '')))                    AS total_he,
    LTRIM(RTRIM(ISNULL([Total Faltas], '')))                AS total_faltas
FROM RTT_APONTAMENTOS_RH
WHERE [Data Apontamento] >= %s AND [Data Apontamento] < %s
  AND [Matrícula] IS NOT NULL
  AND LTRIM(RTRIM([Matrícula])) <> ''
"""

# ── Funções cadastrais ────────────────────────────────────────────────────────

def sync_projetos(sql_cur, sqlite_conn):
    print("Sincronizando projetos...")
    sql_cur.execute(SQL_PROJETOS)
    rows = sql_cur.fetchall()
    batch = [(r['codigo'] if isinstance(r, dict) else r[0], r['nome'] if isinstance(r, dict) else r[1])
             for r in rows if (r['codigo'] if isinstance(r, dict) else r[0]) and (r['codigo'] if isinstance(r, dict) else r[0]) != '#N/D']
    sqlite_conn.executemany("""
        INSERT INTO efetivo_projetos (codigo, nome, ativo)
        VALUES (?, ?, 1)
        ON CONFLICT(codigo) DO UPDATE SET
            nome  = excluded.nome,
            ativo = 1
    """, batch)
    sqlite_conn.commit()
    print(f"   {len(batch)} projetos sincronizados.")

def sync_funcionarios(sql_cur, sqlite_conn):
    print("Sincronizando funcionarios...")
    sql_cur.execute(SQL_FUNCIONARIOS)
    rows = sql_cur.fetchall()
    batch = [r if isinstance(r, dict) else dict(zip([d[0] for d in sql_cur.description], r)) for r in rows]
    sqlite_conn.executemany("""
        INSERT INTO efetivo_funcionarios
            (matricula, nome, funcao, codigo_projeto, situacao, dt_admissao, dt_demissao, tipo_contrato, synced_at)
        VALUES (:matricula,:nome,:funcao,:codigo_projeto,:situacao,:dt_admissao,:dt_demissao,:tipo_contrato,datetime('now'))
        ON CONFLICT(matricula) DO UPDATE SET
            nome           = excluded.nome,
            funcao         = excluded.funcao,
            codigo_projeto = excluded.codigo_projeto,
            situacao       = excluded.situacao,
            dt_admissao    = excluded.dt_admissao,
            dt_demissao    = excluded.dt_demissao,
            tipo_contrato  = excluded.tipo_contrato,
            synced_at      = datetime('now')
    """, batch)
    sqlite_conn.commit()
    print(f"   {len(batch)} funcionarios sincronizados.")

def sync_demissoes(sql_cur, sqlite_conn):
    print("Sincronizando demissoes...")
    sql_cur.execute(SQL_DEMISSOES)
    rows = sql_cur.fetchall()
    atualizados = 0
    for r in rows:
        mat    = (r['matricula'] if isinstance(r, dict) else r[0]).strip()
        dt_dem = r['dt_demissao'] if isinstance(r, dict) else r[1]
        cur = sqlite_conn.execute(
            "UPDATE efetivo_funcionarios SET dt_demissao=?, synced_at=datetime('now') "
            "WHERE matricula=? AND (dt_demissao IS NULL OR dt_demissao < '2000-01-02')",
            (dt_dem, mat)
        )
        atualizados += cur.rowcount
    sqlite_conn.commit()
    print(f"   {atualizados} demissoes atualizadas.")

def sync_demitidos_mes(sql_cur, sqlite_conn, mes, ano):
    """Colaboradores demitidos cujo dt_demissao cai no mês alvo — podem nunca
    ter sido sincronizados como Ativo, mas precisam aparecer na grade."""
    print(f"Sincronizando demitidos do mes {mes:02d}/{ano}...")
    de  = date(ano, mes, 1)
    ate = date(ano, mes + 1, 1) if mes < 12 else date(ano + 1, 1, 1)
    sql_cur.execute(SQL_DEMITIDOS_MES, (de.isoformat(), ate.isoformat()))
    rows = sql_cur.fetchall()
    batch = [r if isinstance(r, dict) else dict(zip([d[0] for d in sql_cur.description], r)) for r in rows]
    sqlite_conn.executemany("""
        INSERT INTO efetivo_funcionarios
            (matricula, nome, funcao, codigo_projeto, situacao, dt_admissao, dt_demissao, tipo_contrato, synced_at)
        VALUES (:matricula,:nome,:funcao,:codigo_projeto,:situacao,:dt_admissao,:dt_demissao,:tipo_contrato,datetime('now'))
        ON CONFLICT(matricula) DO UPDATE SET
            nome           = excluded.nome,
            funcao         = excluded.funcao,
            codigo_projeto = excluded.codigo_projeto,
            situacao       = excluded.situacao,
            dt_admissao    = excluded.dt_admissao,
            dt_demissao    = excluded.dt_demissao,
            tipo_contrato  = excluded.tipo_contrato,
            synced_at      = datetime('now')
    """, batch)
    sqlite_conn.commit()
    print(f"   {len(batch)} demitidos do mes sincronizados.")

def sync_ausencias(sql_cur, sqlite_conn):
    print("Sincronizando ausencias/ferias...")
    sql_cur.execute(SQL_AUSENCIAS)
    rows = sql_cur.fetchall()
    def _r(r, k, i): return r[k] if isinstance(r, dict) else r[i]
    batch = [(_r(r,'matricula',0).strip(), _r(r,'dt_inicio',1), _r(r,'dt_fim',2))
             for r in rows if _r(r,'matricula',0) and _r(r,'dt_inicio',1) and _r(r,'dt_fim',2)]
    sqlite_conn.execute("DELETE FROM efetivo_ausencias")
    sqlite_conn.executemany("""
        INSERT OR REPLACE INTO efetivo_ausencias (matricula, dt_inicio, dt_fim, synced_at)
        VALUES (?, ?, ?, datetime('now'))
    """, batch)
    sqlite_conn.commit()
    print(f"   {len(batch)} periodos de ausencia sincronizados.")

# ── Função principal de apontamentos (substitui sync_presencas + sync_abonos) ─

def sync_apontamentos(sql_cur, sqlite_conn, mes, ano):
    """Lê RTT_APONTAMENTOS_RH — uma linha por colaborador por dia.
    Em uma única passagem sincroniza:
      - Presenças (relógio mapeado → projeto)
      - Abonos (Cod_ Abono presente na linha)
    Preserva presenças manuais já existentes (INSERT OR IGNORE para ponto).
    """
    print(f"Sincronizando apontamentos {mes:02d}/{ano}...")
    mapeamento = carregar_mapeamento_relogios()
    de  = date(ano, mes, 1)
    ate = date(ano, mes + 1, 1) if mes < 12 else date(ano + 1, 1, 1)
    ate_ultimo = ate - timedelta(days=1)

    sql_cur.execute(SQL_APONTAMENTOS, (de.isoformat(), ate.isoformat()))
    rows = sql_cur.fetchall()

    presencas = []   # (matricula, data, codigo_projeto)
    abonos    = []   # (matricula, data, cod_abono)
    atestados = []   # (matricula, data)

    for row in rows:
        r = row if isinstance(row, dict) else dict(zip([d[0] for d in sql_cur.description], row))
        mat  = r['matricula'].strip()
        data = r['data']

        # Presença: relogio mapeado → projeto
        relogio = (r['relogio'] or '').strip()
        if relogio and relogio != '999':
            cod_proj = mapeamento.get(relogio)
            if cod_proj:
                presencas.append((mat, data, cod_proj))

        # Abono
        cod_ab = (r['cod_abono'] or '').strip()
        if cod_ab:
            abonos.append((mat, data, cod_ab))

        # Atestado médico
        if r.get('is_atestado'):
            atestados.append((mat, data))

    # Presenças — INSERT OR IGNORE preserva entradas manuais
    sqlite_conn.executemany("""
        INSERT OR IGNORE INTO efetivo_presenca
            (matricula, data, codigo_projeto, fonte, usuario_input)
        VALUES (?, ?, ?, 'ponto', 'sync_automatico')
    """, presencas)

    # Abonos — substitui o período completo
    sqlite_conn.execute(
        "DELETE FROM efetivo_abonos WHERE data BETWEEN ? AND ?",
        (de.isoformat(), ate_ultimo.isoformat())
    )
    sqlite_conn.executemany("""
        INSERT OR REPLACE INTO efetivo_abonos (matricula, data, cod_abono)
        VALUES (?, ?, ?)
    """, abonos)

    # Atestados — substitui o período completo
    sqlite_conn.execute(
        "DELETE FROM efetivo_atestados WHERE data BETWEEN ? AND ?",
        (de.isoformat(), ate_ultimo.isoformat())
    )
    sqlite_conn.executemany("""
        INSERT OR IGNORE INTO efetivo_atestados (matricula, data)
        VALUES (?, ?)
    """, atestados)

    sqlite_conn.commit()
    print(f"   {len(presencas)} presencas sincronizadas.")
    print(f"   {len(abonos)} abonos sincronizados.")
    print(f"   {len(atestados)} atestados sincronizados.")
    print(f"   (fonte: RTT_APONTAMENTOS_RH — {len(rows):,} linhas lidas)")

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--mes',      type=int, required=True)
    parser.add_argument('--ano',      type=int, required=True)
    parser.add_argument('--so-func',  action='store_true', help='Só cadastros (funcionários/projetos)')
    parser.add_argument('--so-ponto', action='store_true', help='Só apontamentos (ponto/abonos)')
    args = parser.parse_args()

    try:
        import pymssql
        sql_conn = pymssql.connect(
            server=_SQL_SERVER,
            port=_SQL_PORT,
            database=_SQL_DATABASE,
            user=_SQL_USER,
            password=_SQL_PASSWORD,
            login_timeout=15,
            timeout=120
        )
        sql_cur = sql_conn.cursor(as_dict=True)
    except ImportError:
        try:
            import pyodbc
            sql_conn = pyodbc.connect(SQL_CONN_STR)
            sql_cur  = sql_conn.cursor()
        except Exception as e:
            print(f"ERRO ao conectar no SQL Server: {e}")
            return
    except Exception as e:
        print(f"ERRO ao conectar no SQL Server: {e}")
        return

    sqlite_conn = sqlite3.connect(DB)

    if not args.so_ponto:
        sync_projetos(sql_cur, sqlite_conn)
        sync_funcionarios(sql_cur, sqlite_conn)
        sync_demissoes(sql_cur, sqlite_conn)
        sync_demitidos_mes(sql_cur, sqlite_conn, args.mes, args.ano)
        sync_ausencias(sql_cur, sqlite_conn)

    if not args.so_func:
        sync_apontamentos(sql_cur, sqlite_conn, args.mes, args.ano)

    sql_cur.close()
    sql_conn.close()
    sqlite_conn.close()
    print("Sincronizacao concluida.")

if __name__ == '__main__':
    main()
