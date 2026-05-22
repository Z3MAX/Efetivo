# Efetivo RTT — Piloto Local

## 1. Instalar dependências (uma vez só)
```
pip install -r requirements.txt
```

## 2. Criar o banco local (uma vez só)
```
python init_db.py
```

## 3. Sincronizar dados do ponto (repetir todo mês)
```
python sync_ponto.py --mes 4 --ano 2026
```
> Requer ODBC Driver 17 for SQL Server instalado.
> Baixar: https://aka.ms/odbc17

## 4. Rodar o app
```
python app.py
```
Abrir no navegador: http://localhost:5000

## Login padrão
- E-mail: thiego.silva@rttshop.com.br
- Senha: rtt2026

## Fluxo de uso
1. Selecione o mês/ano e o projeto
2. Células verdes = ponto automático (já preenchidas)
3. Células com "+" = clique para selecionar o projeto manualmente
4. No dia ~18, clique em "Fechar [Mês]" para bloquear edições
