# Como publicar o Efetivo RTT no GitHub

## Pré-requisitos

- Conta no GitHub: https://github.com  
- Git instalado no Windows  
  Verifique com: `git --version`  
  Se não estiver instalado: https://git-scm.com/download/win

---

## Passo 1 — Criar o repositório no GitHub

1. Acesse https://github.com/new  
2. Preencha:
   - **Repository name:** `efetivo-rtt`  
   - **Visibility:** Private ← **obrigatório** (contém lógica de negócio interna)  
   - Deixe **desmarcado** "Add a README file" (você já tem os arquivos)  
3. Clique em **Create repository**  
4. Copie a URL que aparece, ex:  
   `https://github.com/SEU_USUARIO/efetivo-rtt.git`

---

## Passo 2 — Abrir o terminal na pasta do projeto

No Windows Explorer, navegue até a pasta do projeto:

```
C:\Users\thiego.silva\OneDrive - RTT SOLUÇÕES INDUSTRIAIS LTDA\CLAUDE\Efetivo
```

Clique com o botão direito em área vazia → **"Open in Terminal"** (ou Abrir no Terminal).

Alternativamente, abra o PowerShell e navegue:

```powershell
cd "C:\Users\thiego.silva\OneDrive - RTT SOLUÇÕES INDUSTRIAIS LTDA\CLAUDE\Efetivo"
```

---

## Passo 3 — Inicializar o repositório git

```powershell
git init
git branch -M main
```

---

## Passo 4 — Verificar o que vai ser commitado

```powershell
git status
```

**Confirme que `.env` e `efetivo.db` NÃO aparecem na lista.**  
Se aparecerem, verifique o `.gitignore` antes de continuar.

---

## Passo 5 — Adicionar os arquivos e fazer o primeiro commit

```powershell
git add .
git commit -m "feat: sistema Efetivo RTT — controle de presença e FTE"
```

---

## Passo 6 — Conectar ao repositório remoto e publicar

Substitua a URL pela que você copiou no Passo 1:

```powershell
git remote add origin https://github.com/SEU_USUARIO/efetivo-rtt.git
git push -u origin main
```

O terminal vai pedir seu usuário e senha (ou token) do GitHub na primeira vez.

> **Dica — Token de acesso:**  
> O GitHub não aceita mais senha direta. Crie um token em:  
> GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)  
> Marque a permissão `repo`. Use o token como "senha" no prompt.

---

## Passo 7 — Confirmar no GitHub

Acesse `https://github.com/SEU_USUARIO/efetivo-rtt` e verifique que:

- ✅ `.env` **não aparece** nos arquivos  
- ✅ `efetivo.db` **não aparece** nos arquivos  
- ✅ `.env.example` aparece (template sem credenciais)  
- ✅ `.gitignore` aparece  

---

## Fluxo de trabalho para commits futuros

Após modificar arquivos:

```powershell
cd "C:\Users\thiego.silva\OneDrive - RTT SOLUÇÕES INDUSTRIAIS LTDA\CLAUDE\Efetivo"
git add .
git commit -m "fix: descrição do que foi corrigido"
git push
```

---

## Clonar o projeto em outra máquina

```powershell
git clone https://github.com/SEU_USUARIO/efetivo-rtt.git
cd efetivo-rtt
pip install -r requirements.txt
cp .env.example .env
# editar .env com as credenciais reais
python init_db.py
python app.py
```

---

## Próximo passo — Produção

Após publicar no GitHub, o próximo passo para subir em produção é configurar um servidor com acesso à rede interna (para o TOTVS) e expor via **Cloudflare Tunnel**. Esse processo está documentado separadamente.
