---
name: Efetivo RTT — Controle de Efetivo e FTE
description: Sistema local Flask+SQLite para gestão de efetivo dos projetos RTT Soluções Industriais, com sincronização TOTVS (SQL Server) e cálculo de FTE mês.
type: project
originSessionId: 4972fa61-2ff8-459c-9369-c2a0fac3afe7
---
## Visão Geral

Piloto local para controle de presença, ausências e FTE dos colaboradores por projeto. Substitui controle manual em planilha. Dados vêm do ERP TOTVS via SQL Server remoto.

**Diretório:** `C:\Users\thieg\OneDrive\Área de Trabalho\Code\efetivo-rtt\`

## Stack

- **Backend:** Python + Flask (app.py) — servidor local porta 5000
- **Banco:** SQLite local (`efetivo.db`)
- **Fonte de dados:** SQL Server TOTVS — `191.243.199.169,15000\RTTSQLEXCEL001` / banco `DATALAKERTT001`
- **Sync:** `sync_ponto.py` via pyodbc
- **Frontend:** HTML+JS vanilla em `templates/index.html` (single page)
- **Login:** `thiego.silva@rttshop.com.br` / `rtt2026`

## Arquivos

| Arquivo | Papel |
|---|---|
| `app.py` | Servidor Flask, todas as rotas /api/* |
| `sync_ponto.py` | Sync SQL Server → SQLite (funcionários, ponto, abonos, ausências, demissões) |
| `init_db.py` | Cria schema, popula projetos, relógios e usuário admin |
| `templates/index.html` | UI completa — grade de presença, indicadores, FTE |
| `templates/login.html` | Tela de login |
| `efetivo.db` | Banco SQLite local (gitignored) |

## Tabelas SQLite

- `efetivo_projetos` — codigo PK, nome, ativo
- `efetivo_relogios` — relogio PK, descricao, codigo_projeto (de-para relógio→projeto)
- `efetivo_funcionarios` — matricula PK, nome, funcao, codigo_projeto, situacao, dt_admissao, dt_demissao, tipo_contrato, synced_at
- `efetivo_presenca` — (matricula, data) UNIQUE, codigo_projeto, fonte (ponto|manual), usuario_input
- `efetivo_abonos` — matricula, data, cod_abono
- `efetivo_ausencias` — (matricula, dt_inicio) PK, dt_fim, synced_at
- `efetivo_fechamento` — mes, ano UNIQUE, fechado_por
- `efetivo_usuarios` — email PK, nome, senha, perfil

## Sync — sync_ponto.py

Ordem de execução no `main()`:
1. `sync_projetos` — projetos ativos do TOTVS
2. `sync_funcionarios` — Ativo/Ausente/Ferias (view RTT_SERV_LISTFUNCV2)
3. `sync_demissoes` — atualiza dt_demissao de demitidos já na base
4. `sync_demitidos_mes(mes, ano)` — **novo**: puxa demitidos cujo dt_demissao cai no mês alvo (para aparecerem na grade)
5. `sync_ausencias` — períodos de ausência/férias (Ausente_DTinicial / Ausente_dtfinal). dtfinal nulo → '2099-12-31'
6. `sync_presencas(mes, ano)` — ponto eletrônico via RTT_SP8010, mapeado por relógio
7. `sync_abonos(mes, ano)` — abonos via RTT_SPC010

**Uso:**
```
python sync_ponto.py --mes 4 --ano 2026
python sync_ponto.py --mes 4 --ano 2026 --so-func   # só cadastros
python sync_ponto.py --mes 4 --ano 2026 --so-ponto  # só ponto/abonos
```

## Regras de Negócio — FTE

### Fórmula
```
FTE mês = (somaPresD2 / totalDias) × uteis
```
- `uteis` = dias úteis (seg-sex) do mês
- `totalDias` = todos os dias do mês (calendário completo, incluindo FDS)
- `somaPresD2` = Σ (presentesPorDia[dt] / uteis) para cada dia até D-2
- `presentesPorDia[dt]` = nº de colaboradores que somam custo naquele dia

### O que conta no FTE por dia

**Dias úteis (seg-sex):**
| Condição | Soma FTE? |
|---|---|
| NC (antes admissão ou após demissão) | ❌ |
| Ponto eletrônico ou manual registrado | ✅ |
| SP (funcao começa com COORD* ou GER*) | ✅ |
| Férias (FER) — período mapeado no TOTVS | ✅ |
| Ausente (AUS) — dentro do período INSS/licença | ❌ |
| Abono com custo (`ABONO_CUSTO`) | ✅ |
| EL — Ativo/Ausente/Ferias não-Intermitente sem evento | ✅ |

**Fins de semana (FDS):**
| Condição | Soma FTE? |
|---|---|
| NC | ❌ |
| Ausente dentro do período mapeado | ❌ |
| Ausente sem período mapeado (fallback) | ❌ |
| HE — ponto registrado no FDS | ✅ |
| FDS — todos os outros (Ativo, Férias, SP) | ✅ |

### Códigos de abono que geram custo
`ABONO_CUSTO = ['21','04','11','40','41','43','44']`

### EL — Entendimento Lógico
Todo dia útil sem nenhum evento registrado para colaborador não-Intermitente → assume presença no projeto (EL). Não há mais verificação de adjacência (dia anterior/seguinte). Badge amarelo clicável na grade.

### SP — Sem Ponto
Funções que começam com `COORD` ou `GER` são sempre consideradas presentes (sem necessidade de ponto).

### Demitidos no mês
Colaboradores demitidos com `dt_demissao` dentro do mês consultado aparecem na grade:
- Dias antes da demissão: contam normalmente (ponto, EL, etc.)
- Dias após demissão: badge NC

## Badges Visuais na Grade

| Badge | Cor | Significado | Soma FTE? |
|---|---|---|---|
| `183` verde | badge-ponto | Ponto automático | ✅ |
| `183` azul | badge-manual | Preenchimento manual | ✅ |
| `NC` cinza | badge-nc | Não contratado (fora do período) | ❌ |
| `SP` índigo | badge-sp | Sem ponto — custo automático (COORD/GER) | ✅ |
| `FER` verde escuro | badge-fer | Férias | ✅ |
| `AUS` roxo | badge-aus | Ausente INSS/licença | ❌ |
| `HE` laranja | badge-he | Hora extra (ponto no FDS) | ✅ |
| `FDS` azul claro | badge-fds | Fim de semana sem ponto | ✅ |
| `EL` amarelo | badge-el | Entendimento lógico | ✅ |
| `NCV` vermelho | badge-ncv | Não convocado (abono) | ❌ |
| `AF` roxo | badge-af | Afastamento (abono) | ❌ |
| `AB` amarelo | badge-ab | Outro abono | depende |
| `INT` amarelo | badge-int | Contrato intermitente (indicador inline) | — |
| `+` | vazio | Sem registro — clique para preencher | ❌ |

## API Flask (app.py)

| Rota | Método | Descrição |
|---|---|---|
| `/api/projetos` | GET | Lista projetos ativos |
| `/api/funcionarios` | GET | Funcionários por projeto/mês — inclui Demitidos do mês |
| `/api/presencas` | GET | Presenças do mês |
| `/api/presencas` | POST | Salvar presença manual |
| `/api/abonos` | GET | Abonos do mês |
| `/api/ausencias` | GET | Períodos de ausência com JOIN situacao |
| `/api/fechamento` | GET/POST | Verificar/fechar mês |
| `/api/sync-status` | GET | Data da última sync |

## Projetos Cadastrados (principais)

| Código | Nome | Relógios |
|---|---|---|
| 183 | Petrobras REVAP | 003–008 (SP-SJC_REVAP 01–06) |
| 208 | Petrobras REFAP | 403–408 |
| 43 | Vale S11D | 101–103, 105, 106 |
| 159 | Vale Porto Norte | 303, 305 |
| 194 | Transpetro Suape | 502, 503 |
| 141 | Ultracargo Suape | 501 |
| 225 | Hydro Alunorte | 107 |
| 214 | Brava RN | 702 |
| 74 | CSN UPV Mecânica | 202 |
| 135 | CSN UPV Vulcanização | 203 |
| 131 | CSN UPV Despoeiramento | 204 |

**Relógios sem projeto mapeado (pendência):** 001, 002 (ADM-ATI), 201 (ADM-RJ), 504 (GALPAO-PE)

## Análise FTE Abril/2026 — Referência

| Projeto | HC | FTE | Util% |
|---|---|---|---|
| 183 REVAP | 312 | 292,2 | 93,7% |
| 208 REFAP | 502 | 482,7 | 96,1% |
| 43 S11D | 217 | 200,2 | 92,3% |
| 159 Porto Norte | 162 | 122,1 | 75,4% |
| 194 Transpetro | 132 | 121,8 | 92,2% |
| **TOTAL empresa** | **2.374** | **1.977,5** | — |

## Pendências

1. **Relógios sem mapeamento:** 001, 002, 201, 504 — usuário está atualizando a lista completa
2. **Rodrigo Bertazzo (010717):** `codigo_projeto = #N/D` no TOTVS — corrigir no ERP
3. **LUIZ ANDRADE (011811) e PAULO ARMANDO (011812):** aparecem como Ativos no 183 mas não estavam no HC oficial de abril — verificar
4. **Exportação de relatório:** quadro FTE por projeto ainda não está na UI (só via script Python)
