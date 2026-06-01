import sqlite3
conn = sqlite3.connect('efetivo.db')
conn.execute("DELETE FROM efetivo_presenca WHERE fonte='ponto'")
conn.commit()
print(conn.total_changes, 'presencas do ponto removidas')
conn.close()
