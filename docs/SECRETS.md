# Inventário de Secrets — Cockpit Onix

Este documento lista **todos os segredos** usados pelo Cockpit Onix, onde
ficam armazenados, como rotacioná-los e onde obtê-los.

> **Regra de ouro:** nenhum valor real entra no Git. Use sempre placeholders
> (`<SET_IN_GITHUB_SECRETS>`, `<SET_IN_RAILWAY_VARS>`) em arquivos versionados.

## Sumário

- [GitHub Actions — Secrets](#github-actions--secrets)
- [GitHub Actions — Variables](#github-actions--variables)
- [Railway — Environment Variables](#railway--environment-variables)
- [Cloudflare R2 — como obter as credenciais](#cloudflare-r2--como-obter-as-credenciais)
- [Slack Webhook — como obter](#slack-webhook--como-obter)
- [Backup do `.env` do Railway (offline)](#backup-do-env-do-railway-offline)
- [Rotação de segredos](#rotação-de-segredos)

---

## GitHub Actions — Secrets

Configurar em **Settings → Secrets and variables → Actions → New repository secret**.

| Nome | Usado por | Origem | Observação |
|------|-----------|--------|------------|
| `DATABASE_URL` | `db-backup.yml`, `restore-drill.yml` | Railway → projeto `cockpit-onix` → variável `DATABASE_URL` (Postgres) | Mesmo valor exato que está no Railway. Inclui senha — **nunca** versionar. |
| `R2_ACCOUNT_ID` | `db-backup.yml`, `restore-drill.yml` | Cloudflare Dashboard → R2 → topo da página | É o ID da conta (32 chars hex), não o ID do bucket. |
| `R2_ACCESS_KEY_ID` | `db-backup.yml`, `restore-drill.yml` | Cloudflare R2 → Manage R2 API Tokens → Create API token | Token com permissão **Read & Write** no bucket de backup. |
| `R2_SECRET_ACCESS_KEY` | `db-backup.yml`, `restore-drill.yml` | Mostrado uma única vez ao criar o token acima | Se perder, gerar token novo. |
| `R2_BUCKET` | `db-backup.yml`, `restore-drill.yml` | Nome do bucket criado no R2 (ex.: `cockpit-onix-backups`) | Bucket precisa existir antes do primeiro run. |
| `SLACK_WEBHOOK_URL` | `db-backup.yml`, `post-deploy-smoke.yml`, `restore-drill.yml` | Slack App → Incoming Webhooks → Add New Webhook to Workspace | **Opcional.** Sem ele, workflows só logam falhas. |
| `CRON_SECRET` | `cron.yml` (já existente) | Definido por você; mesmo valor entra na env `CRON_SECRET` no Railway | Bearer usado pra autenticar cron→app. |

> `GITHUB_TOKEN` é **automático** — o `post-deploy-smoke.yml` usa
> `${{ secrets.GITHUB_TOKEN }}` que o Actions injeta sozinho para criar
> a issue de incidente. Não precisa configurar.

> **Não confundir:** `R2_ACCESS_KEY_ID` ≠ `R2_ACCOUNT_ID`. O primeiro é o ID
> do token (gerado por bucket), o segundo é o ID global da conta Cloudflare.

## GitHub Actions — Variables

Configurar em **Settings → Secrets and variables → Actions → Variables → New repository variable**.

| Nome | Usado por | Valor | Observação |
|------|-----------|-------|------------|
| `APP_BASE_URL` | `cron.yml`, `post-deploy-smoke.yml` | `https://cockpit-onix-production.up.railway.app` | URL pública da app. Mude se trocar de domínio. |

## Railway — Environment Variables

> Listado **apenas com nomes**, sem valores. Para inspecionar valores, use
> `railway variables` localmente (logado) ou o painel.

| Nome | Tipo | Onde é usado |
|------|------|--------------|
| `DATABASE_URL` | Postgres conn string | Prisma (`src/lib/prisma.ts`) |
| `SESSION_SECRET` | JWT signing key | Auth (`src/lib/auth.ts`) |
| `CRON_SECRET` | Bearer token | `src/lib/cron-guard.ts` |
| `GOOGLE_CLIENT_ID` | OAuth | `src/lib/integrations/google/*` |
| `GOOGLE_CLIENT_SECRET` | OAuth | idem |
| `MS_CLIENT_ID` | OAuth Microsoft | `src/lib/integrations/microsoft/*` |
| `MS_CLIENT_SECRET` | OAuth Microsoft | idem |
| `BTG_API_TOKEN` | API key | `src/lib/integrations/btg/*` |
| `DATACRAZY_API_TOKEN` | API key | `src/lib/integrations/datacrazy/*` |
| `DATACRAZY_WEBHOOK_SECRET` | HMAC | webhook handler |
| `MANYCHAT_API_TOKEN` | API key | `src/app/api/webhooks/manychat/*` |
| `INSTAGRAM_GRAPH_TOKEN` | API key | analytics |
| `B2_KEY_ID` / `B2_APP_KEY` / `B2_BUCKET` | Backblaze | upload de PDFs (Jurídico) |
| `OUTLOOK_ICS_URL` | URL | `src/app/api/cron/outlook-poll/*` |
| `CRYPTO_KEY` | AES-256-GCM key | `src/lib/crypto.ts` (tokens cifrados no DB) |

A lista completa varia ao longo do tempo. Snapshot oficial: ver
[Backup do .env](#backup-do-env-do-railway-offline) abaixo.

---

## Cloudflare R2 — como obter as credenciais

1. Acesse <https://dash.cloudflare.com> → conta correta → **R2**.
2. Anote o **Account ID** que aparece no topo da página → vira `R2_ACCOUNT_ID`.
3. **Create bucket**:
   - Nome: `cockpit-onix-backups` (ou outro — o que for, vai no `R2_BUCKET`)
   - Location: **Automatic** (ou `EEUR` / `ENAM` conforme preferência)
   - **NÃO marque "Public access"**
4. Após criar, vá em **R2 → Manage R2 API Tokens → Create API token**:
   - Token name: `cockpit-onix-backup-rw`
   - Permissions: **Object Read & Write**
   - Specify bucket: o bucket criado acima
   - TTL: deixe **Forever** (vamos rotacionar manualmente — anote a data em `DISASTER_RECOVERY.md`)
   - Clique **Create API Token**
5. Copie imediatamente:
   - **Access Key ID** → `R2_ACCESS_KEY_ID`
   - **Secret Access Key** → `R2_SECRET_ACCESS_KEY` (mostrado uma vez só)
6. Configure as **Object Lifecycle Rules** do bucket (R2 → bucket → Settings):
   - Rule 1: prefixo `daily/`, expirar objetos após **30 dias**
   - Rule 2: prefixo `weekly/`, expirar objetos após **84 dias**
   - Rule 3: prefixo `monthly/`, expirar objetos após **365 dias**

> **Custo previsto:** ~US$ 0,015 / GB-mês de armazenamento + zero egress
> dentro do free tier (10 GB de storage grátis). Para um Postgres médio
> (~200 MB comprimido) o custo fica abaixo de US$ 0,10/mês.

## Slack Webhook — como obter

1. Crie ou reuse um Slack App em <https://api.slack.com/apps>.
2. **Incoming Webhooks → Activate** → **Add New Webhook to Workspace**.
3. Escolha o canal (sugestão: `#alertas-cockpit`).
4. Copie a URL que começa com `https://hooks.slack.com/services/...` → vira `SLACK_WEBHOOK_URL`.

> **Opcional.** Se o secret não existir, os workflows apenas logam a falha
> sem quebrar — útil para começar sem Slack e adicionar depois.

---

## Backup do `.env` do Railway (offline)

O Railway é fonte da verdade das variáveis em produção, mas se a conta cair
você fica sem acesso. Para sobreviver a esse cenário, mantenha uma cópia
**cifrada** das variáveis num cofre externo (1Password recomendado).

### Procedimento (rodar **localmente**, mensalmente)

1. Logue no Railway CLI: `railway login`
2. Vincule ao projeto: `railway link`
3. Exporte as variáveis: `railway variables --kv > railway.env`
4. Cifre com `age` (mais simples) ou `sops`:
   ```bash
   # Opção A — age (uma chave SSH ou age-keygen)
   age -r "$(cat ~/.config/age/recipient.pub)" -o railway.env.age railway.env
   rm railway.env

   # Opção B — sops + age
   sops --encrypt --age "$(cat ~/.config/age/recipient.pub)" railway.env > railway.env.enc
   rm railway.env
   ```
5. Suba o arquivo cifrado pro 1Password:
   - Cofre: `Onix → Infra`
   - Item: `Railway env snapshot — cockpit-onix`
   - Anexo: `railway.env.age` (ou `.enc`)
   - Campo: `data do snapshot: YYYY-MM-DD`
6. Atualize a linha "Última exportação" em `docs/DISASTER_RECOVERY.md`.

> A chave `age` privada (`~/.config/age/key.txt`) também tem que estar no
> 1Password — sem ela o backup é inútil. Mas **em um item separado** do
> snapshot do `.env`, pra que comprometer um não comprometa o outro.

---

## Rotação de segredos

| Segredo | Periodicidade | Como rotacionar |
|---------|---------------|-----------------|
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | A cada 6 meses ou em incidente | Criar novo token no Cloudflare → atualizar GitHub Secrets → testar `db-backup` via `workflow_dispatch` → revogar token antigo |
| `SLACK_WEBHOOK_URL` | Em incidente | Recriar webhook no Slack App → atualizar GitHub Secret |
| `CRON_SECRET` | A cada 12 meses | Gerar novo (`openssl rand -hex 32`) → atualizar Railway **E** GitHub Secret no mesmo deploy |
| `SESSION_SECRET` | Em vazamento (invalida sessões) | Gerar novo → atualizar Railway → todos os usuários precisam relogar |
| Tokens OAuth (Google/MS) | Quando refresh token expirar | Refluxo OAuth dentro do app (`/integracoes`) |

> Toda rotação deve ser registrada em `docs/DISASTER_RECOVERY.md` na
> tabela **"Última data de teste/rotação"**.
