# Disaster Recovery — Cockpit Onix

> Documento operacional. Atualize sempre que rodar um drill, fizer um
> rollback de verdade ou rotacionar um segredo. **A regra é simples:
> procedimento não testado = procedimento que não funciona.**

## Sumário

- [Inventário do sistema](#inventário-do-sistema)
- [RTO/RPO objetivos](#rtorpo-objetivos)
- [Cenário 1 — Deploy quebrado no Railway](#cenário-1--deploy-quebrado-no-railway)
- [Cenário 2 — Migration Prisma com falha](#cenário-2--migration-prisma-com-falha)
- [Cenário 3 — Banco corrompido ou perdido](#cenário-3--banco-corrompido-ou-perdido)
- [Cenário 4 — Conta Railway inacessível](#cenário-4--conta-railway-inacessível)
- [Contatos e ordem de escalação](#contatos-e-ordem-de-escalação)
- [Última data de teste de cada procedimento](#última-data-de-teste-de-cada-procedimento)

---

## Inventário do sistema

| Componente | Onde mora | Como acessar | Backup |
|------------|-----------|--------------|--------|
| App Next.js | Railway (projeto `cockpit-onix`) | <https://cockpit-onix-app-production.up.railway.app> | Git (GitHub `main`) + Railway redeploy |
| Postgres | Railway (mesmo projeto) | Internal: `DATABASE_URL` env var | **R2 diário** + Railway PITR (clicar no painel) |
| Storage de PDFs | Backblaze B2 | `B2_BUCKET` env | Replicação B2 (configurar manualmente) |
| OAuth tokens (Google/MS) | Postgres (`UserGoogleAuth`, `UserMicrosoftAuth`) cifrados | `CRYPTO_KEY` env decifra | Junto com o dump Postgres |
| Cron schedules | GitHub Actions (`.github/workflows/cron.yml`) | Repo Settings → Actions | Versionado em Git |
| Backup do Postgres | Cloudflare R2 (bucket `cockpit-onix-backups`) | `aws s3 ls s3://... --endpoint-url=https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com` | Lifecycle rules: 30 dias daily/, 84 dias weekly/, 365 dias monthly/ |
| Secrets (CI) | GitHub repo → Settings → Actions → Secrets | (web) | Snapshot manual em 1Password — ver `docs/SECRETS.md` |
| Variáveis de produção | Railway → Variables | `railway variables` | Snapshot mensal cifrado com `age`, anexado no 1Password |

## RTO/RPO objetivos

| Métrica | Objetivo | Estado atual | Caminho pra melhorar |
|---------|----------|--------------|----------------------|
| **RTO (Recovery Time Objective)** | ≤ 30 min para subir app + DB num novo Railway / outro provedor | ~45 min (sem ensaio real ainda — meta após drill #1) | Drill mensal de "criar projeto novo" |
| **RPO (Recovery Point Objective)** | ≤ 24 h de perda de dados (backup diário 06:00 UTC) | 24h | Habilitar Railway PITR (clique no painel) → cai pra ~5min |

> **PITR do Railway:** ativar no painel do projeto → Database → Backups →
> "Enable Point-in-Time Recovery". Custo adicional ~US$ 5/mês para nosso
> volume. Combinado com R2 diário, vira 3-2-1-1-0 de verdade.

---

## Cenário 1 — Deploy quebrado no Railway

**Sintoma:** smoke test (`post-deploy-smoke.yml`) ficou vermelho. Página
principal não carrega, ou `/api/health` responde 5xx, ou `/login` veio
sem layout. Issue automática com label `incident` foi criada.

### Procedimento (alvo: ≤ 5 min)

```bash
# 1. Confirmar que é o deploy: ver últimas 3 mudanças
git log --oneline -3 origin/main

# 2. Abrir Railway → projeto cockpit-onix → Deployments
#    Clicar no penúltimo deploy verde → "Redeploy"
#    (NÃO usa "Rollback" no Railway porque ele às vezes pula migrations
#     do Prisma db push do startCommand — redeploy do commit anterior é
#     mais previsível.)

# 3. Aguardar healthcheck do Railway ficar verde (~2min)

# 4. Confirmar volta:
curl -fsS https://cockpit-onix-app-production.up.railway.app/api/health | jq .
#    → { "status": "ok", "db": "up", ... }

# 5. Disparar smoke manualmente para fechar o ciclo
gh workflow run post-deploy-smoke.yml   # ou via UI
```

### Depois de estabilizar

1. Abrir PR de reversão do commit ruim (`git revert <sha>`)
2. Atualizar a issue de incidente com root cause + commit do fix
3. Anotar em ["Última data de teste"](#última-data-de-teste-de-cada-procedimento)

---

## Cenário 2 — Migration Prisma com falha

**Sintoma:** deploy passou mas `prisma db push` no startCommand quebrou
(coluna não pode ser dropada, NOT NULL sem default em tabela com dados,
etc.). App fica em loop de restart.

> **Atenção:** o `startCommand` é
> `prisma db push --accept-data-loss && next start`. `--accept-data-loss`
> é perigoso — drops colunas sem perguntar. Em migrations destrutivas,
> sempre fazer staging do schema antes do push.

### Procedimento (alvo: ≤ 15 min)

```bash
# 1. Voltar o schema.prisma para o estado anterior
git log --oneline -- prisma/schema.prisma | head -5
git checkout <sha_antes_do_break> -- prisma/schema.prisma

# 2. (CRÍTICO) Se a migration anterior DROPPOU uma coluna que tinha
#    dados, esses dados se foram. Restaurar do R2:
#    (ver Cenário 3, parte "Restore parcial via export/import")

# 3. Commit do rollback do schema
git add prisma/schema.prisma
git commit -m "fix(schema): revert breaking change xyz"
git push origin main

# 4. Aguardar Railway redeployar e healthcheck ficar verde
```

### Prevenção (faça no próximo deploy de schema)

- Rode `prisma migrate diff --from-url $PROD_DATABASE_URL --to-schema-datamodel prisma/schema.prisma --script` **antes** de commitar e revise
- Para colunas NOT NULL novas, adicione com default → backfill → remova default num segundo deploy
- Considere mudar o startCommand pra `prisma migrate deploy` (precisa de migrations versionadas — ainda não temos)

---

## Cenário 3 — Banco corrompido ou perdido

**Sintoma:** DB do Railway sumiu, corrompeu, foi truncado por engano,
admin rodou DROP DATABASE, etc. `/api/health` retorna 503 com `db: down`
permanente, ou retorna `up` mas tabelas estão vazias.

### Procedimento — Restore total (alvo: ≤ 60 min)

```bash
# 1. CONGELAR: desativar webhooks do BTG/Datacrazy/ManyChat pra não
#    receber novos dados que iam pra um DB inconsistente.
#    (Painel de cada provedor → Webhooks → Disable.)

# 2. No Railway, criar Postgres NOVO (Add Service → Database → Postgres)
#    OU usar PITR pra trazer de volta o estado de N min atrás.
#    Se for PITR, pular pra passo 7.

# 3. Pegar a connection string do Postgres novo (Variables → DATABASE_URL)

# 4. Listar backups no R2 e escolher o mais recente:
ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
aws s3 ls "s3://${R2_BUCKET}/daily/" --endpoint-url "$ENDPOINT" | tail -10

# 5. Baixar o backup escolhido:
aws s3 cp "s3://${R2_BUCKET}/daily/cockpit-onix-YYYYMMDD-HHMMSS.dump.gz" ./b.dump.gz \
  --endpoint-url "$ENDPOINT"
gunzip b.dump.gz

# 6. Restaurar no Postgres novo:
pg_restore --no-owner --no-acl --verbose --exit-on-error \
  --dbname="<DATABASE_URL_DO_POSTGRES_NOVO>" \
  b.dump

# 7. Apontar o app pro novo DB:
#    Railway → Service cockpit-onix → Variables → editar DATABASE_URL
#    Railway redeploya automaticamente.

# 8. Validar com health + smoke:
curl -fsS https://cockpit-onix-app-production.up.railway.app/api/health | jq .

# 9. Re-habilitar webhooks (revertendo passo 1).

# 10. Trigger backup imediato pra ter snapshot pós-restore:
gh workflow run db-backup.yml
```

### Restore parcial (uma tabela só)

Use quando uma migration apagou uma coluna mas o resto do DB está OK.

```bash
# 1. Restaurar dump em DB temporário local
docker run -d --name pg-tmp -p 5499:5432 \
  -e POSTGRES_PASSWORD=tmp postgres:16-alpine
pg_restore --no-owner --no-acl --exit-on-error \
  --dbname=postgresql://postgres:tmp@localhost:5499/postgres \
  b.dump

# 2. Exportar só a tabela afetada
pg_dump -h localhost -p 5499 -U postgres \
  --table='"ClienteBackoffice"' --data-only \
  --column-inserts \
  postgres > clientes.sql

# 3. Aplicar no DB de produção (CUIDADO: pode duplicar PKs — use ON CONFLICT)
psql "$PROD_DATABASE_URL" < clientes.sql

# 4. Limpar
docker rm -f pg-tmp
```

---

## Cenário 4 — Conta Railway inacessível

**Sintoma:** suspensão de conta, problema de billing, MFA quebrado, ou o
Railway saiu do ar globalmente. App fora indefinidamente.

> Este é o cenário com maior RTO. A meta razoável é ≤ 4 horas até subir
> em outro provedor com DB restaurado. Se for crítico ter ≤ 1 hora, é
> necessário pré-configurar um ambiente warm-standby (não temos ainda).

### Procedimento (alvo: ≤ 4 h)

```bash
# 1. Decidir provedor alternativo. Opções viáveis pra Next.js 16 + Postgres:
#    - Render.com (mais parecido com Railway, deploy a partir do GitHub)
#    - Fly.io (mais controle, requer Dockerfile)
#    - Vercel (app) + Neon (DB) (mais barato pra Postgres, mas separa app/DB)
#    Recomendação: Render (menor switching cost).

# 2. Criar Postgres novo no provedor escolhido
#    → guardar a connection string como NEW_DATABASE_URL

# 3. Restaurar último backup do R2 (Cenário 3, passos 4-6)
#    → apontar pg_restore --dbname=<NEW_DATABASE_URL>

# 4. Recuperar as variáveis de produção do snapshot 1Password:
#    1Password → "Onix → Infra" → "Railway env snapshot — cockpit-onix"
#    → baixar railway.env.age
age --decrypt -i ~/.config/age/key.txt railway.env.age > railway.env
# Conferir que não tem nada esquisito
cat railway.env

# 5. Subir o app no provedor novo apontando para:
#    DATABASE_URL = NEW_DATABASE_URL
#    Demais variáveis = railway.env (exceto secrets de Railway-only)

# 6. Configurar build command:
#    npm install && npx prisma generate && npm run build
#    Start command:
#    next start
#    (NÃO usar o startCommand do railway.toml com prisma db push em provedor
#     novo na primeira subida — schema já veio do restore. Push depois se
#     houver diff entre schema.prisma e o restaurado.)

# 7. Atualizar DNS (se tiver domínio custom) ou comunicar nova URL provisória
#    pros usuários.

# 8. Atualizar APP_BASE_URL (GitHub Actions Variables) e DATABASE_URL
#    (GitHub Actions Secrets) pra apontar pro novo ambiente. Sem isso o
#    db-backup e smoke continuam falando com Railway morto.

# 9. Habilitar de novo o cron de backup contra o DB novo:
gh workflow run db-backup.yml
```

### Antes do incidente — pré-requisitos que precisam estar OK

- [ ] Snapshot do `.env` Railway no 1Password atualizado nos últimos 30 dias
- [ ] Chave `age` privada também no 1Password (item separado)
- [ ] Credenciais R2 testadas com `db-backup.yml` rodando manualmente
- [ ] DNS gerenciado em provedor que não seja o próprio Railway

---

## Contatos e ordem de escalação

| # | Quem | Quando | Canal |
|---|------|--------|-------|
| 1 | Eduardo Campos (owner) | Sempre — qualquer incidente | WhatsApp pessoal, e-mail |
| 2 | Slack `#alertas-cockpit` | Falhas automáticas (workflows mandam) | Webhook |
| 3 | GitHub Issues com label `incident` ou `backup-broken` | Criadas pelo `post-deploy-smoke.yml` e `restore-drill.yml` | (web) |
| 4 | Suporte Railway | DB caiu, projeto suspenso, billing | help.railway.app / Discord |
| 5 | Suporte Cloudflare | Bucket R2 inacessível | dash.cloudflare.com → Support |

---

## Última data de teste de cada procedimento

> **Regra:** procedimento sem teste há mais de 90 dias está expirado.
> Quando rodar, atualize a linha.

| Procedimento | Última execução | Tempo gasto | Resultado | Quem |
|--------------|------------------|--------------|-----------|------|
| Cenário 1 — Rollback Railway | _nunca_ | — | — | — |
| Cenário 2 — Reverter schema Prisma | _nunca_ | — | — | — |
| Cenário 3 — Restore total do R2 | _nunca_ | — | — | — |
| Cenário 3 — Restore parcial (1 tabela) | _nunca_ | — | — | — |
| Cenário 4 — Subir em outro provedor | _nunca_ | — | — | — |
| Restore drill automático (`restore-drill.yml`) | 2026-05-25 13:31 UTC | 2s (restore) + ~1min total | ✅ verde — 65 tabelas, 1 User, 2602 ClienteBackoffice, frescor=yes (73 colunas timestamp varridas) — [run 26403048590](https://github.com/edurcampos86-jpg/cockpit-onix/actions/runs/26403048590) | claude code |
| Snapshot `.env` Railway → 1Password | _nunca_ | — | — | — |
| Rotação `R2_ACCESS_KEY_ID` | _nunca_ | — | — | — |
| Rotação `CRON_SECRET` | _nunca_ | — | — | — |
