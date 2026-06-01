"""
app.py — Servidor Flask para o piloto local do Efetivo RTT.
Rodar: python app.py
Acesso: http://localhost:5000
"""
import sqlite3, os, hashlib
from datetime import datetime, date
from functools import wraps
from flask import Flask, jsonify, request, render_template, session, redirect, url_for

DB  = os.path.join(os.path.dirname(__file__), 'efetivo.db')
app = Flask(__name__)
app.secret_key = 'efetivo-rtt-2026'

# ── Migração automática ───────────────────────────────────────────────

def run_migrations():
    conn = sqlite3.connect(DB)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS efetivo_atestados (
            matricula  TEXT NOT NULL,
            data       TEXT NOT NULL,
            synced_at  TEXT DEFAULT (datetime('now')),
            PRIMARY KEY (matricula, data)
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_atestados_mat ON efetivo_atestados(matricula)")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS efetivo_ausencias_manual (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            matricula     TEXT NOT NULL,
            dt_inicio     TEXT NOT NULL,
            dt_fim        TEXT NOT NULL,
            motivo        TEXT,
            usuario_input TEXT,
            created_at    TEXT DEFAULT (datetime('now')),
            UNIQUE(matricula, dt_inicio)
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_aus_manual_mat ON efetivo_ausencias_manual(matricula)")
    conn.commit()
    conn.close()

run_migrations()

# ── Helpers ──────────────────────────────────────────────────────────

def get_db():
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    return conn

def login_required(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        if 'usuario' not in session:
            if request.path.startswith('/api/'):
                return jsonify({'erro': 'não autenticado'}), 401
            return redirect(url_for('login_page'))
        return f(*args, **kwargs)
    return wrapper

def mes_fechado(mes, ano):
    db = get_db()
    r = db.execute(
        "SELECT id FROM efetivo_fechamento WHERE mes=? AND ano=?", (mes, ano)
    ).fetchone()
    db.close()
    return r is not None

# ── Páginas ───────────────────────────────────────────────────────────

@app.route('/')
@login_required
def index():
    return render_template('index.html')

@app.route('/login', methods=['GET'])
def login_page():
    return render_template('login.html')

@app.route('/login', methods=['POST'])
def login_post():
    email = request.form.get('email', '').strip().lower()
    senha = request.form.get('senha', '')
    db = get_db()
    user = db.execute(
        "SELECT * FROM efetivo_usuarios WHERE email=? AND senha=?", (email, senha)
    ).fetchone()
    db.close()
    if not user:
        return render_template('login.html', erro='E-mail ou senha incorretos.')
    session['usuario'] = {'email': user['email'], 'nome': user['nome'], 'perfil': user['perfil']}
    return redirect(url_for('index'))

@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('login_page'))

# ── API: Projetos ─────────────────────────────────────────────────────

@app.route('/api/projetos')
@login_required
def api_projetos():
    db = get_db()
    rows = db.execute("SELECT codigo, nome FROM efetivo_projetos WHERE ativo=1 ORDER BY codigo").fetchall()
    db.close()
    return jsonify([dict(r) for r in rows])

# ── API: Funcionários ─────────────────────────────────────────────────

@app.route('/api/funcionarios')
@login_required
def api_funcionarios():
    projeto = request.args.get('projeto', '')
    busca   = request.args.get('busca', '').strip()
    mes     = int(request.args.get('mes', date.today().month))
    ano     = int(request.args.get('ano', date.today().year))

    import calendar
    de  = f"{ano}-{mes:02d}-01"
    ate = f"{ano}-{mes:02d}-{calendar.monthrange(ano, mes)[1]:02d}"

    # Aparece no projeto se:
    # 1) situação ativa (Ativo/Ausente/Ferias) e cadastro bate com o projeto, OU
    # 2) teve presença registrada naquele projeto no mês, OU
    # 3) foi demitido dentro do mês (conta os dias em que esteve contratado)
    if projeto:
        sql = """
            SELECT DISTINCT f.matricula, f.nome, f.funcao, f.codigo_projeto, f.situacao,
                            f.dt_admissao, f.dt_demissao, f.tipo_contrato
            FROM efetivo_funcionarios f
            WHERE (
                f.situacao IN ('Ativo','Ausente','Ferias')
                OR (f.situacao = 'Demitido' AND f.dt_demissao BETWEEN ? AND ?)
            )
            AND (
                f.codigo_projeto = ?
                OR f.matricula IN (
                    SELECT DISTINCT matricula FROM efetivo_presenca
                    WHERE codigo_projeto = ?
                      AND data BETWEEN ? AND ?
                )
            )
        """
        params = [de, ate, projeto, projeto, de, ate]
    else:
        sql    = """
            SELECT matricula, nome, funcao, codigo_projeto, situacao, dt_admissao, dt_demissao, tipo_contrato
            FROM efetivo_funcionarios
            WHERE situacao IN ('Ativo','Ausente','Ferias')
               OR (situacao = 'Demitido' AND dt_demissao BETWEEN ? AND ?)
        """
        params = [de, ate]

    if busca:
        sql += " AND (f.nome LIKE ? OR f.matricula LIKE ?)" if projeto else " AND (nome LIKE ? OR matricula LIKE ?)"
        params += [f'%{busca}%', f'%{busca}%']

    sql += " ORDER BY f.nome" if projeto else " ORDER BY nome"
    # garante que demitidos do mês aparecem no topo com indicação visual via dt_demissao

    db   = get_db()
    rows = db.execute(sql, params).fetchall()
    db.close()
    return jsonify([dict(r) for r in rows])

# ── API: Presenças ────────────────────────────────────────────────────

@app.route('/api/presencas')
@login_required
def api_presencas():
    mes  = int(request.args.get('mes', date.today().month))
    ano  = int(request.args.get('ano', date.today().year))
    proj = request.args.get('projeto', '')

    de  = f"{ano}-{mes:02d}-01"
    import calendar
    ultimo = calendar.monthrange(ano, mes)[1]
    ate = f"{ano}-{mes:02d}-{ultimo:02d}"

    sql = """
        SELECT p.matricula, p.data, p.codigo_projeto, p.fonte
        FROM efetivo_presenca p
    """
    params = [de, ate]
    if proj:
        sql = """
            SELECT p.matricula, p.data, p.codigo_projeto, p.fonte
            FROM efetivo_presenca p
            INNER JOIN efetivo_funcionarios f ON p.matricula = f.matricula
            WHERE p.data BETWEEN ? AND ?
              AND f.codigo_projeto = ?
        """
        params.append(proj)
    else:
        sql += " WHERE p.data BETWEEN ? AND ?"

    db   = get_db()
    rows = db.execute(sql, params).fetchall()
    db.close()
    return jsonify([dict(r) for r in rows])

@app.route('/api/presencas', methods=['POST'])
@login_required
def api_presencas_salvar():
    body    = request.get_json()
    mes     = int(body['data'].split('-')[1])
    ano     = int(body['data'].split('-')[0])

    if mes_fechado(mes, ano):
        return jsonify({'erro': 'Mês fechado. Edição bloqueada.'}), 403

    db = get_db()
    db.execute("""
        INSERT INTO efetivo_presenca (matricula, data, codigo_projeto, fonte, usuario_input, updated_at)
        VALUES (?, ?, ?, 'manual', ?, datetime('now'))
        ON CONFLICT(matricula, data) DO UPDATE SET
            codigo_projeto = excluded.codigo_projeto,
            fonte          = 'manual',
            usuario_input  = excluded.usuario_input,
            updated_at     = datetime('now')
    """, (body['matricula'], body['data'], body.get('codigo_projeto') or None,
          session['usuario']['email']))
    db.commit()
    db.close()
    return jsonify({'ok': True})

@app.route('/api/presencas/bulk', methods=['POST'])
@login_required
def api_presencas_bulk():
    """
    Recebe lista de registros de presença e insere em lote.
    Body: {
      registros: [{matricula, data, codigo_projeto}],
      sobrescrever: true|false   (false = só insere onde não há registro)
    }
    """
    body       = request.get_json()
    registros  = body.get('registros', [])
    sobrescrever = body.get('sobrescrever', False)

    if not registros:
        return jsonify({'erro': 'Nenhum registro enviado.'}), 400

    # Verificar fechamento — agrupa por mês/ano
    meses = set()
    for r in registros:
        parts = r['data'].split('-')
        meses.add((int(parts[1]), int(parts[0])))
    for mes, ano in meses:
        if mes_fechado(mes, ano):
            return jsonify({'erro': f'Mês {mes:02d}/{ano} está fechado. Edição bloqueada.'}), 403

    db = get_db()
    inseridos = 0; ignorados = 0; erros = []
    usuario = session['usuario']['email']

    for r in registros:
        mat  = r.get('matricula')
        data = r.get('data')
        proj = r.get('codigo_projeto') or None
        if not mat or not data:
            erros.append({'registro': r, 'erro': 'matricula ou data ausente'})
            continue
        try:
            if sobrescrever:
                # Upsert completo
                db.execute("""
                    INSERT INTO efetivo_presenca
                        (matricula, data, codigo_projeto, fonte, usuario_input, updated_at)
                    VALUES (?, ?, ?, 'manual', ?, datetime('now'))
                    ON CONFLICT(matricula, data) DO UPDATE SET
                        codigo_projeto = excluded.codigo_projeto,
                        fonte          = 'manual',
                        usuario_input  = excluded.usuario_input,
                        updated_at     = datetime('now')
                """, (mat, data, proj, usuario))
                inseridos += 1
            else:
                # Só insere se não existe
                cur = db.execute("""
                    INSERT OR IGNORE INTO efetivo_presenca
                        (matricula, data, codigo_projeto, fonte, usuario_input)
                    VALUES (?, ?, ?, 'manual', ?)
                """, (mat, data, proj, usuario))
                if cur.rowcount > 0:
                    inseridos += 1
                else:
                    ignorados += 1
        except Exception as e:
            erros.append({'matricula': mat, 'data': data, 'erro': str(e)})

    db.commit()
    db.close()
    return jsonify({'inseridos': inseridos, 'ignorados': ignorados, 'erros': erros})

# ── API: Abonos ──────────────────────────────────────────────────

@app.route('/api/abonos')
@login_required
def api_abonos():
    mes = int(request.args.get('mes', date.today().month))
    ano = int(request.args.get('ano', date.today().year))
    import calendar
    de  = f"{ano}-{mes:02d}-01"
    ate = f"{ano}-{mes:02d}-{calendar.monthrange(ano, mes)[1]:02d}"
    db  = get_db()
    rows = db.execute(
        "SELECT matricula, data, cod_abono FROM efetivo_abonos WHERE data BETWEEN ? AND ?",
        (de, ate)
    ).fetchall()
    db.close()
    return jsonify([dict(r) for r in rows])

# ── API: Ausências / Férias ───────────────────────────────────────────

@app.route('/api/ausencias')
@login_required
def api_ausencias():
    mes = int(request.args.get('mes', date.today().month))
    ano = int(request.args.get('ano', date.today().year))
    import calendar
    de  = f"{ano}-{mes:02d}-01"
    ate = f"{ano}-{mes:02d}-{calendar.monthrange(ano, mes)[1]:02d}"
    db  = get_db()
    # TOTVS
    rows_totvs = db.execute(
        """SELECT a.matricula, a.dt_inicio, a.dt_fim, f.situacao, 'totvs' as fonte
           FROM efetivo_ausencias a
           LEFT JOIN efetivo_funcionarios f ON a.matricula = f.matricula
           WHERE a.dt_inicio <= ? AND a.dt_fim >= ?""",
        (ate, de)
    ).fetchall()
    # Manuais — prevalecem (não sobrescritas pelo sync)
    rows_manual = db.execute(
        """SELECT a.matricula, a.dt_inicio, a.dt_fim,
                  COALESCE(f.situacao, 'Ausente') as situacao, 'manual' as fonte
           FROM efetivo_ausencias_manual a
           LEFT JOIN efetivo_funcionarios f ON a.matricula = f.matricula
           WHERE a.dt_inicio <= ? AND a.dt_fim >= ?""",
        (ate, de)
    ).fetchall()
    db.close()
    # Manuais têm prioridade: remover da lista TOTVS quem tem registro manual
    mats_manual = {r['matricula'] for r in rows_manual}
    combined = [dict(r) for r in rows_manual] + \
               [dict(r) for r in rows_totvs if r['matricula'] not in mats_manual]
    return jsonify(combined)

# ── API: Atestados ───────────────────────────────────────────────────

@app.route('/api/atestados')
@login_required
def api_atestados():
    mes = int(request.args.get('mes', date.today().month))
    ano = int(request.args.get('ano', date.today().year))
    import calendar
    de  = f"{ano}-{mes:02d}-01"
    ate = f"{ano}-{mes:02d}-{calendar.monthrange(ano, mes)[1]:02d}"
    db  = get_db()
    rows = db.execute(
        "SELECT matricula, data FROM efetivo_atestados WHERE data BETWEEN ? AND ?",
        (de, ate)
    ).fetchall()
    db.close()
    return jsonify([dict(r) for r in rows])

# ── API: Ausências manuais (CRUD) ─────────────────────────────────────

@app.route('/api/ausencias/manual', methods=['GET'])
@login_required
def api_ausencias_manual_list():
    projeto = request.args.get('projeto', '')
    busca   = request.args.get('busca', '').strip()
    db = get_db()
    sql = """
        SELECT m.id, m.matricula, f.nome, f.funcao, f.codigo_projeto,
               m.dt_inicio, m.dt_fim, m.motivo, m.usuario_input, m.created_at
        FROM efetivo_ausencias_manual m
        LEFT JOIN efetivo_funcionarios f ON m.matricula = f.matricula
    """
    params = []
    conds = []
    if projeto:
        conds.append("f.codigo_projeto = ?"); params.append(projeto)
    if busca:
        conds.append("(f.nome LIKE ? OR m.matricula LIKE ?)"); params += [f'%{busca}%', f'%{busca}%']
    if conds:
        sql += " WHERE " + " AND ".join(conds)
    sql += " ORDER BY m.matricula, m.dt_inicio"
    rows = db.execute(sql, params).fetchall()
    db.close()
    return jsonify([dict(r) for r in rows])

@app.route('/api/ausencias/manual', methods=['POST'])
@login_required
def api_ausencias_manual_salvar():
    body = request.get_json()
    registros = body if isinstance(body, list) else [body]
    db = get_db()
    inseridos = 0; erros = []
    for r in registros:
        try:
            db.execute("""
                INSERT INTO efetivo_ausencias_manual
                    (matricula, dt_inicio, dt_fim, motivo, usuario_input)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(matricula, dt_inicio) DO UPDATE SET
                    dt_fim        = excluded.dt_fim,
                    motivo        = excluded.motivo,
                    usuario_input = excluded.usuario_input,
                    created_at    = datetime('now')
            """, (r['matricula'], r['dt_inicio'], r['dt_fim'],
                  r.get('motivo', ''), session['usuario']['email']))
            inseridos += 1
        except Exception as e:
            erros.append({'matricula': r.get('matricula'), 'erro': str(e)})
    db.commit(); db.close()
    return jsonify({'inseridos': inseridos, 'erros': erros})

@app.route('/api/ausencias/manual/<int:id>', methods=['DELETE'])
@login_required
def api_ausencias_manual_delete(id):
    db = get_db()
    db.execute("DELETE FROM efetivo_ausencias_manual WHERE id = ?", (id,))
    db.commit(); db.close()
    return jsonify({'ok': True})

# ── API: Fechamento ───────────────────────────────────────────────────

@app.route('/api/fechamento')
@login_required
def api_fechamento():
    mes = int(request.args.get('mes'))
    ano = int(request.args.get('ano'))
    return jsonify({'fechado': mes_fechado(mes, ano)})

@app.route('/api/fechamento', methods=['POST'])
@login_required
def api_fechar_mes():
    body = request.get_json()
    mes, ano = int(body['mes']), int(body['ano'])
    db = get_db()
    try:
        db.execute(
            "INSERT INTO efetivo_fechamento (mes, ano, fechado_por) VALUES (?,?,?)",
            (mes, ano, session['usuario']['email'])
        )
        db.commit()
    except sqlite3.IntegrityError:
        pass
    db.close()
    return jsonify({'ok': True})

# ── API: Status do sync ───────────────────────────────────────────────

@app.route('/api/sync-status')
@login_required
def api_sync_status():
    db = get_db()
    r  = db.execute("SELECT MAX(synced_at) as ultima FROM efetivo_funcionarios").fetchone()
    total_func = db.execute("SELECT COUNT(*) FROM efetivo_funcionarios").fetchone()[0]
    db.close()
    return jsonify({'ultima_sync': r['ultima'], 'total_funcionarios': total_func})

# ── Main ──────────────────────────────────────────────────────────────

if __name__ == '__main__':
    if not os.path.exists(DB):
        print("Banco não encontrado. Execute: python init_db.py")
    else:
        print("Banco OK")
    print("Abrindo em http://localhost:5000")
    app.run(debug=True, port=5000)
