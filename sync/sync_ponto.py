"""
sync_ponto.py — Sincroniza SQL Server (TOTVS) → Supabase

Execução:
    pip install pyodbc supabase python-dotenv
    python sync_ponto.py --mes 4 --ano 2026

Variáveis de ambiente (.env):
    SQL_SERVER=191.243.199.169,15000\RTTSQLEXCEL001
    SQL_DB=DATALAKERTT001
    SQL_USER=thiego.silva
    SQL_PASS=udyt$#sdsQ
    SUPABASE_URL=https://xxx.supabase.co
    SUPABASE_SERVICE_KEY=sua_service_role_key
"""

import argparse
import os
from datetime import date, timedelta
from dotenv import load_dotenv
import pyodbc
from supabase import create_client

load_dotenv()

# ── Conexões ────────────────────────────────────────────────────────
def sql_conn():
    return pyodbc.connect(
        f"DRIVER={{ODBC Driver 17 for SQL Server}};"
        f"SERVER={os.environ['SQL_SERVER']};"
        f"DATABASE={os.environ['SQL_DB']};"
        f"UID={os.environ['SQL_USER']};"
        f"PWD={os.environ['SQL_PASS']};"
        f"TrustServerCertificate=yes;"
    )

def supa_client():
    return create_client(os.environ['SUPABASE_URL'], os.environ['SUPABASE_SERVICE_KEY'])

# ── Funcionários ativos ─────────────────────────────────────────────
SYNC_FUNCIONARIOS_SQL = """
WITH ranked AS (
    SELECT
        RA_MAT     AS matricula,
        RA_NOME    AS nome,
        FUNCAO     AS funcao,
        -- extrai código numérico do início de PROJETO (ex: '43 - VALE S11D' → '43')
        LTRIM(RTRIM(LEFT(PROJETO, CHARINDEX(' ', PROJETO + ' ') - 1))) AS codigo_projeto,
        SITUACAO   AS situacao,
        CONVERT(DATE, DT_ADMISSAO)  AS dt_admissao,
        CONVERT(DATE, DT_DEMISSAO)  AS dt_demissao,
        ROW_NUMBER() OVER (
            PARTITION BY RA_MAT
            ORDER BY CASE SITUACAO
                WHEN 'Ativo'    THEN 0
                WHEN 'Ausente'  THEN 1
                WHEN 'Ferias'   THEN 2
                ELSE 3 END,
            DT_ADMISSAO DESC
        ) AS rn
    FROM RTT_SERV_LISTFUNCV2
)
SELECT matricula, nome, funcao, codigo_projeto, situacao, dt_admissao, dt_demissao
FROM ranked
WHERE rn = 1
  AND situacao IN ('Ativo', 'Ausente', 'Ferias')
"""

def sync_funcionarios(cur, supa):
    print("→ Sincronizando funcionários...")
    cur.execute(SYNC_FUNCIONARIOS_SQL)
    rows = cur.fetchall()
    cols = [d[0] for d in cur.description]

    batch = []
    for row in rows:
        rec = dict(zip(cols, row))
        # Converte datas para string ISO
        for campo in ('dt_admissao', 'dt_demissao'):
            if rec[campo]:
                rec[campo] = rec[campo].isoformat()
        batch.append(rec)

    if batch:
        supa.table('efetivo_funcionarios').upsert(batch, on_conflict='matricula').execute()
    print(f"   {len(batch)} funcionários sincronizados.")

# ── Presenças do mês via ponto eletrônico ───────────────────────────
PRESENCA_SQL = """
WITH relogios AS (
    SELECT P0_RELOGIO, P0_DESC FROM RTT_SP0010 WHERE P0_RELOGIO <> '999'
),
mapeamento AS (
    -- De-para hardcoded (espelha a tabela efetivo_relogios do Supabase)
    SELECT relogio, codigo_projeto FROM (VALUES
        ('001','ADM-ATI'),('002','ADM-ATI'),
        ('003','183'),('004','183'),('005','183'),('006','183'),('007','183'),('008','183'),
        ('101','43'),('102','43'),('103','43'),('104','CARAJAS'),('105','43'),('106','43'),
        ('107','HYDRO'),
        ('201','ADM-RJ'),
        ('202','74'),('203','74'),('204','74'),
        ('205','TABG'),('206','TABG'),
        ('301','141-ITA'),('302','141-ITA'),
        ('303','159'),('304','ALUMAR'),('305','159'),
        ('401','UTE'),('402','UTE'),
        ('403','208'),('404','208'),('405','208'),('406','208'),('407','208'),('408','208'),
        ('501','141'),('502','194'),('503','194'),('504','GALPAO-PE'),
        ('601','ANSA'),('701','ALTO-RN'),('702','214'),('801','HOCHS')
    ) AS t(relogio, codigo_projeto)
)
SELECT DISTINCT
    p8.P8_MAT                     AS matricula,
    CONVERT(DATE, p8.P8_DATA)     AS data,
    m.codigo_projeto
FROM RTT_SP8010 p8
INNER JOIN mapeamento m ON p8.P8_RELOGIO = m.relogio
WHERE p8.P8_DATA >= ?
  AND p8.P8_DATA  < ?
"""

def sync_presencas(cur, supa, mes: int, ano: int):
    print(f"→ Sincronizando presenças {mes:02d}/{ano}...")
    de  = date(ano, mes, 1)
    ate = (date(ano, mes + 1, 1) if mes < 12 else date(ano + 1, 1, 1))

    cur.execute(PRESENCA_SQL, de.isoformat(), ate.isoformat())
    rows = cur.fetchall()

    # Monta registros — fonte='ponto', NÃO sobrescreve entradas manuais
    batch = []
    for mat, dt, cod in rows:
        batch.append({
            'matricula':      mat.strip(),
            'data':           dt.isoformat(),
            'codigo_projeto': cod,
            'fonte':          'ponto',
            'usuario_input':  'sync_automatico',
        })

    if batch:
        # ignoreDuplicates=True: se já existe entrada manual (unique constraint),
        # o upsert ignora — preserva o preenchimento manual do usuário
        supa.table('efetivo_presenca').upsert(
            batch,
            on_conflict='matricula,data',
            ignore_duplicates=True
        ).execute()
    print(f"   {len(batch)} presenças sincronizadas (ponto automático).")

# ── Main ────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--mes', type=int, required=True,  help='Mês (1-12)')
    parser.add_argument('--ano', type=int, required=True,  help='Ano (ex: 2026)')
    parser.add_argument('--so-func', action='store_true',  help='Sincroniza só funcionários')
    parser.add_argument('--so-ponto', action='store_true', help='Sincroniza só presenças')
    args = parser.parse_args()

    conn = sql_conn()
    cur  = conn.cursor()
    supa = supa_client()

    if not args.so_ponto:
        sync_funcionarios(cur, supa)

    if not args.so_func:
        sync_presencas(cur, supa, args.mes, args.ano)

    cur.close()
    conn.close()
    print("✓ Sincronização concluída.")

if __name__ == '__main__':
    main()
