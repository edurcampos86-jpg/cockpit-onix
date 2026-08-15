# Cockpit Onix

Painel de comando do **Grupo Onix** — Next.js 16 + Postgres. Hospedado em [cockpit-onix-production.up.railway.app](https://cockpit-onix-production.up.railway.app).

## O que é

O Cockpit reúne em um único sistema cinco frentes que antes viviam espalhadas:

- **Editorial / Mídias Sociais** (`/calendario`, `/roteiros`, `/tarefas`, `/leads`, `/relatorio`, `/reunioes`, `/analytics`) — pipeline de conteúdo Instagram, regra 80/20, sync de transcrições do Plaud.
- **Onix Corretora** (`/metodo`, `/onix-corretora/*`) — gestão comercial: relatórios individuais e coletivos, perfis, trilha de desenvolvimento, rituais, alertas de pipeline, painel semanal, projeto T&D.
- **Backoffice BTG** (`/backoffice/*`) — base de clientes BTG, sync de posições e movimentações, cadência 12-4-2, painel do dia, grupos WhatsApp, indicações, receita, performance.
- **Time** (`/time/*`) — Pessoas, hierarquia, numerologia, PAT, acordos comerciais, reuniões 1:1.
- **Plataforma** (`/kpis`, `/integracoes`, `/configuracoes`, `/glossario`, `/onboarding/[token]`) — KPIs transversais, integrações, glossário.

## Autoexplicativo

Cada tela operacional traz no topo um cartão **"Como funciona"** com três blocos:
**Propósito · Como usar · Como te ajuda.** Em caso de dúvida sobre um termo, consulte o **[/glossario](https://cockpit-onix-production.up.railway.app/glossario)** dentro do app.

## Stack

- **Framework:** Next.js 16 (App Router) + React 19 + TypeScript
- **Banco:** PostgreSQL via Prisma 7.6 (cliente em `src/generated/prisma`)
- **Auth:** JWT (`jose`) + bcryptjs, cookie httpOnly
- **UI:** Tailwind 4 + shadcn/ui (dark mode com acentos dourados)
- **Hospedagem:** Railway (`railway.toml`)

## Integrações

| Integração | Função |
|---|---|
| **BTG Pactual** | Sync de posições, movimentações (webhook), cadastrais (`/api/integracoes/btg/*`, `/api/backoffice/btg-*`) |
| **Datacrazy WhatsApp** | Conversas em tempo real (webhook + cron poll) — grupos vinculáveis a cliente |
| **Google Calendar** | Sync de reuniões com clientes (próxima + última) |
| **Outlook (ICS publicado)** | Sync de agenda via ICS público |
| **ManyChat** | Leads do funil → pipeline |
| **Plaud.ai (via Zapier)** | Transcrições + geração de roteiro |
| **Claude AI** | Runtime interno de agentes: copiloto, analista de KPIs, briefing semanal |
| **Instagram Graph** | Métricas de posts (analytics) |

## Como rodar localmente

```bash
# pré-requisitos: Node 20+, Postgres rodando, .env.local preenchido
npm install
npx prisma generate
npx prisma db push        # cria/atualiza tabelas
npx tsx prisma/seed.ts    # dados iniciais (opcional)
npm run dev               # http://localhost:3000
```

Variáveis mínimas em `.env.local`:

```
DATABASE_URL=postgres://...
SESSION_SECRET=...
```

Tokens das integrações ficam em `Config` (tabela do DB) ou `.env.local` — configuráveis em `/integracoes`.

## Estrutura do código

```
src/
├── app/
│   ├── (rotas)/page.tsx          ← server components renderizando UIs
│   ├── api/                      ← REST endpoints (Next route handlers)
│   │   ├── backoffice/           ← clientes, BTG, receita, eventos
│   │   ├── integracoes/          ← ManyChat, BTG, Google, Zapier
│   │   ├── agents/               ← runtime de agentes IA
│   │   └── cron/                 ← jobs (datacrazy-poll, google-cal-poll)
│   └── actions/                  ← server actions (auth, time, settings)
├── components/
│   ├── backoffice/               ← dashboards, painel, cadência
│   ├── onix-corretora/           ← trilha, perfis, relatórios
│   ├── layout/                   ← shell, sidebar, page-header, como-funciona
│   └── ui/                       ← shadcn/ui
└── lib/
    ├── integrations/             ← clientes das APIs externas
    ├── agents/                   ← cockpit, corretora, kpis (runtime IA)
    ├── painel-do-dia/            ← boot, focus-blocks, triagem, retrospectiva
    └── prisma.ts / session.ts    ← infra
```

## Operação

Subagentes Claude Code em [`.claude/agents/`](.claude/agents/) automatizam:

- `migration-doctor` — drift entre schema, migrations e DB de prod
- `import-guardian` — imports BTG seguros (dry-run + match por CPF + rollback)
- `integration-healthcheck` — saúde das integrações com alerta Slack/WhatsApp
- `release-gate` — build + lint + revisão dirigida antes de push
- `audit-trail-clientes` — rastreabilidade de mutações em ficha de cliente
- `tutorial-keeper` — mantém documentação alinhada ao código
- `copiloto-painel-do-dia` — operação diária via chat
- `security-sweep` — varredura focada no domínio Onix

Detalhes e gatilhos em [`.claude/agents/README.md`](.claude/agents/README.md).

## Disaster Recovery

Arquitetura de backup e procedimentos de recuperação seguem a regra
**3-2-1-1-0** (3 cópias, 2 mídias, 1 offsite, 1 imutável, 0 erros após teste).

| Camada | Onde está |
|--------|-----------|
| Backup diário do Postgres → Cloudflare R2 | [`.github/workflows/db-backup.yml`](.github/workflows/db-backup.yml) |
| Smoke tests pós-deploy + cron 15min | [`.github/workflows/post-deploy-smoke.yml`](.github/workflows/post-deploy-smoke.yml) |
| Restore drill semanal automatizado | [`.github/workflows/restore-drill.yml`](.github/workflows/restore-drill.yml) |
| Endpoint público de health | [`src/app/api/health/route.ts`](src/app/api/health/route.ts) |

Documentação operacional:

- [`docs/DISASTER_RECOVERY.md`](docs/DISASTER_RECOVERY.md) — RTO/RPO, 4 cenários de incidente passo-a-passo
- [`docs/BACKUP_ARCHITECTURE.md`](docs/BACKUP_ARCHITECTURE.md) — diagrama Mermaid + custos
- [`docs/SECRETS.md`](docs/SECRETS.md) — inventário de secrets, rotação, backup do `.env` com `age`
- [`docs/BRANCH_PROTECTION.md`](docs/BRANCH_PROTECTION.md) — config manual da proteção da `main`

## Convenções

- **Matching de cliente nunca só por nome.** Chave forte: CPF/CNPJ, número de conta, ID BTG, CGE, telefone. Nome é apenas confirmação.
- **Imports definem antes**: chave de match, campos a atualizar, política de "sem match" (rejeitar/quarentena/criar).
- **Mutações em prod** sempre via PR — `start` faz `prisma db push` (cuidado com drift).
- **Branches**: `feat/`, `fix/`, `chore/`, `docs/`. Commits padrão: `tipo(escopo): descrição`. PR fecha com `(#N)`.

## Licença

Privado — Grupo Onix.
