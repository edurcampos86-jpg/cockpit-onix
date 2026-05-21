# Setup R2 + Secrets — Cockpit Onix Disaster Recovery

**Contexto:** o PR #49 (`feat(dr): arquitetura de backup e recuperação 3-2-1-1-0`) acabou de ser mergeado em `main` no repositório `edurcampos86-jpg/cockpit-onix`. Os workflows estão prontos mas precisam de credenciais externas pra rodar. Sua missão é executar o setup manual da Cloudflare R2 + cadastrar todos os GitHub Secrets, e ao final disparar o primeiro backup manual pra validar o caminho feliz.

**Pré-requisitos que Eduardo já tem:**
- Conta Cloudflare ativa (mesma do gerenciamento de DNS da Onix, se houver)
- Acesso de owner ao repo `edurcampos86-jpg/cockpit-onix` no GitHub
- `railway` CLI logado (`railway whoami` retorna conta certa) **OU** acesso ao painel Railway
- (Opcional) Workspace Slack onde criar webhook

---

## Etapa 1 — Cloudflare R2: criar bucket + token

1. Abrir **<https://dash.cloudflare.com>** logado.
2. **Anotar o Account ID** (canto superior direito ou em "R2 Object Storage" no topo da página de R2) — esse é o valor `R2_ACCOUNT_ID`.
3. Menu lateral → **R2 Object Storage** → **Create bucket**:
   - **Bucket name:** `cockpit-onix-backups`
   - **Location:** Automatic
   - **Default Storage Class:** Standard
   - **NÃO marcar "Allow public access"**
   - Clicar **Create bucket**.
4. Dentro do bucket criado, ir em **Settings → Object Lifecycle Rules → Add rule**:
   - **Rule 1:**
     - Name: `expire-daily`
     - Apply to: `Prefix` → `daily/`
     - Action: `Delete objects` after `30 days`
   - **Rule 2:**
     - Name: `expire-weekly`
     - Prefix: `weekly/`
     - Delete objects after `84 days`
   - **Rule 3:**
     - Name: `expire-monthly`
     - Prefix: `monthly/`
     - Delete objects after `365 days`
5. Voltar para **R2 Object Storage** (página geral, não dentro do bucket) → **Manage R2 API Tokens** → **Create API token**:
   - **Token name:** `cockpit-onix-backup-rw`
   - **Permissions:** **Object Read & Write**
   - **Specify bucket(s):** marcar **apenas** `cockpit-onix-backups`
   - **TTL:** Forever
   - Clicar **Create API Token**.
6. **Copiar IMEDIATAMENTE em local seguro (1Password ou notas temporárias):**
   - `Access Key ID` → vai virar `R2_ACCESS_KEY_ID`
   - `Secret Access Key` → vai virar `R2_SECRET_ACCESS_KEY` (mostrado UMA vez só)
   - Confirmar que `Account ID` (passo 2) está anotado.

> **Se algo der errado:** a referência completa está em `docs/SECRETS.md` no repositório.

## Etapa 2 — Slack webhook (opcional, mas recomendado)

Se Eduardo tiver Slack e quiser notificações de incidente:

1. <https://api.slack.com/apps> → **Create New App** (ou reusar um existente) → "From scratch" → nome `cockpit-onix-alerts`, workspace correto.
2. Menu lateral → **Incoming Webhooks** → toggle **Activate** para On.
3. **Add New Webhook to Workspace** → escolher canal (sugestão: `#alertas-cockpit` ou DM com Eduardo).
4. Copiar a URL `https://hooks.slack.com/services/T.../B.../...` → vai virar `SLACK_WEBHOOK_URL`.

Se Eduardo não quiser Slack agora, **pular esta etapa**. Os workflows funcionam sem — só não notificam.

## Etapa 3 — Pegar a `DATABASE_URL` do Railway

1. Painel Railway → projeto **cockpit-onix** → serviço Postgres → **Variables** → copiar o valor de `DATABASE_URL` (começa com `postgresql://`). Inclui senha; não imprimir em chat.
2. **OU** via CLI:
   ```bash
   railway link   # se ainda não estiver linkado
   railway variables --json | jq -r '.DATABASE_URL'
   ```

## Etapa 4 — Cadastrar GitHub Secrets

Abrir **<https://github.com/edurcampos86-jpg/cockpit-onix/settings/secrets/actions>** e clicar **New repository secret** para cada um dos seguintes. **Em cada um, "Name" é exato (sensível a maiúsculas).**

| Name | Value |
|------|-------|
| `DATABASE_URL` | (valor copiado da etapa 3) |
| `R2_ACCOUNT_ID` | (Account ID da etapa 1.2) |
| `R2_ACCESS_KEY_ID` | (Access Key ID da etapa 1.6) |
| `R2_SECRET_ACCESS_KEY` | (Secret Access Key da etapa 1.6) |
| `R2_BUCKET` | `cockpit-onix-backups` |
| `SLACK_WEBHOOK_URL` | (URL da etapa 2 — **pular se não fez Slack**) |

**Validação rápida:** depois de cadastrar, a lista de secrets deve mostrar todos sem que os valores fiquem visíveis. Se algum estiver visível, foi cadastrado como Variable em vez de Secret — apagar e refazer.

Bonus: confirmar que a Variable `APP_BASE_URL` existe em **<https://github.com/edurcampos86-jpg/cockpit-onix/settings/variables/actions>** com valor `https://cockpit-onix-production.up.railway.app` (provavelmente já existe — só conferir).

## Etapa 5 — Disparar o primeiro backup manual

1. Acessar **<https://github.com/edurcampos86-jpg/cockpit-onix/actions/workflows/db-backup.yml>**
2. Clicar **Run workflow** (direita) → manter branch `main` → preencher reason `primeiro teste manual` → **Run workflow**.
3. Aguardar o run aparecer (~5s) e clicar nele para ver progresso.
4. Esperar até `~3-5 min`. **Comportamento esperado:**
   - Steps verdes na ordem: `Validate required secrets`, `Compute filename and prefixes`, `Run pg_dump inside postgres:16-alpine`, `Upload to R2`, `Verify upload landed in R2`, `Summary`.
   - Step final mostra `Backup gerado: cockpit-onix-YYYYMMDD-HHMMSS.dump.gz (N MB)`.
5. **Se passar:** confirmar no painel R2 que o objeto apareceu em `cockpit-onix-backups/daily/cockpit-onix-...dump.gz`. ✅ Tarefa concluída.
6. **Se falhar:** copiar a saída do step que falhou e abrir como issue no repo com label `incident`. Causas comuns:
   - `Secrets ausentes:` → algum secret foi escrito errado na etapa 4 (digitar de novo, atenção a underscores)
   - `server version mismatch` → Postgres do Railway é 17+, não 16 — neste caso, ajustar o workflow para `postgres:17-alpine` e tentar de novo
   - `403 / 401 do R2` → token R2 está com scope diferente (não Object R&W) ou expirou — recriar na etapa 1.5

## Etapa 6 — Reportar de volta

Quando concluir, responder ao Eduardo no chat com:

1. Confirmação de que **bucket R2 foi criado** e tem lifecycle rules.
2. Lista dos **secrets cadastrados** (apenas os nomes, sem valores).
3. **URL do Actions run** do primeiro backup manual + status (✅ ou ❌ com erro).
4. Se aparecer no R2, **tamanho do arquivo gerado** (proxy de saúde do DB).

## Importante

- **Não comitar nenhum valor** no Git, nem em commit message, nem em PR description.
- Se o snapshot da etapa 1.6 (Secret Access Key) for perdido, gerar um token NOVO em vez de tentar recuperar — não dá pra ver de novo depois de fechar a página.
- O documento `docs/SECRETS.md` no repo tem essas mesmas instruções com mais contexto — usar como referência se algo der dúvida.
- Não tocar em outros secrets que já estejam no repo (`CRON_SECRET`, etc.) — esses são de outros workflows pré-existentes.

## Depois disso (não precisa fazer agora)

Eduardo vai cuidar manualmente de:
- Aplicar branch protection na `main` (`docs/BRANCH_PROTECTION.md`)
- Habilitar PITR no Railway (opcional, +US$ 5/mês, derruba RPO de 24h pra 5min)
- Fazer o primeiro snapshot cifrado do `.env` Railway no 1Password
