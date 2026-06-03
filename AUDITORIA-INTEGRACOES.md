# Auditoria de Integrações — Cockpit Onix

**Data:** 2026-06-02 · **Modo:** somente leitura · **Método:** 8 sub-agentes em paralelo, um por integração, template fixo de 8 pontos.
**Domínios:** ANTIGO = `cockpit-onix-production.up.railway.app` (e `*.up.railway.app`) · NOVO = `www.ecossistemaonix.com.br`.
**Nota de infra transversal:** os crons REAIS vivem em `.github/workflows/cron.yml` (GitHub Actions). Os `[[crons]]` de `railway.toml` estão **MORTOS** (Railway parou de processá-los). Vários comentários no código ainda dizem "roda via railway.toml" — doc desatualizada.

---

## A. Tabela mestre

| # | Integração | Estado | Risco | Webhook/callback — domínio | Crons (cron.yml) |
|---|---|---|---|---|---|
| 1 | **Google** (Calendar + Gmail) | Ativa (calendar poll + painel on-demand); triagem automática quebrada | **ALTO** | OAuth `redirect_uri` derivado do host do request (sem hardcode); cadastrar URI NOVA no Google Console | `google-calendar-poll` `*/15` |
| 2 | **Sync/Crons** (reuniões + Cadência) | Ativa; `cadencia-backfill` desagendado; `auto-encerrar` quebrado | **MÉDIO-ALTO** | Crons chamam `APP_BASE_URL` (GitHub var) — doc aponta p/ ANTIGO | google-cal `*/15`, outlook `*/30`, datacrazy-ativ `*/30` |
| 3 | **Microsoft/Outlook** | ICS ativo; OAuth Graph dormente (ninguém conectado) | **MÉDIO-ALTO** | OAuth `redirect_uri` derivado do host; cadastrar URI NOVA no Azure App | `outlook-poll` `*/30` (ICS) |
| 4 | **BTG Pactual** | Ativa (3 polls); webhook dormente/não confiável | **MÉDIO-ALTO** | Webhook configurado no portal BTG (fora do repo) — **verificar manualmente** | movements `0 4 * * 2`, balances `0 9 * * *`, cadastral `0 7 * * 0` |
| 5 | **ManyChat** | Dormente (sync 100% manual, sem cron/webhook) | **ALTO** (token exposto) | Só outbound — N/A | nenhum |
| 6 | **Plaud** (via Zapier) | Provável ativa, não verificável pelo repo | **ALTO** | URL do webhook configurada no Zapier (fora do repo) — **verificar manualmente** | nenhum |
| 7 | **DataCrazy** | Ativa (webhook + 2 polls) | **BAIXO-MÉDIO** | Doc do webhook aponta p/ domínio **ANTIGO** (só comentário) | datacrazy-poll `*/5`, datacrazy-ativ `*/30` |
| 8 | **WhatsApp** | Ativa **como subproduto do DataCrazy** (não é módulo próprio; sem z-API no código) | **MÉDIO** | Mesmo webhook do DataCrazy (doc no ANTIGO) | herda datacrazy-poll `*/5` |

---

## B. Mapa de dependências

```
                         ┌─────────────────────────────┐
                         │  crypto.ts                  │
                         │  GOOGLE_TOKEN_ENC_KEY        │  ← cifra tokens de Google E Microsoft
                         └──────────┬──────────────────┘
                                    │
            ┌───────────────────────┼───────────────────────┐
            ▼                       ▼                        ▼
      Google OAuth            Microsoft OAuth          (mesma key de cifra)
   (UserGoogleAuth)         (UserMicrosoftAuth)

   ── Painel do Dia ─────────────────────────────────────────────
   agregador.ts  ←  Google (agenda+gmail)  +  Microsoft Graph (agenda+mail)
        │            (tipos EventoAgenda / EmailAcao compartilhados —
        │             mexer no formato quebra os DOIS providers de uma vez)
        ▼
   PainelCacheExterno (fallback cowork)

   ── ReuniaoCliente (TABELA COMPARTILHADA) ─────────────────────
        ▲            ▲                    ▲
        │            │                    │   discriminada por `source`
   google-cal    outlook-ics       datacrazy-atividade
        │            │                    │
        └────────────┴────────────────────┘
                     │  núcleo comum: reunioes.ts (upsert/cleanup/recompute)
                     │              + reunioes-cleanup.ts (guarda fetchOk)
                     ▼
   ClienteBackoffice.ultimoContatoAt / proxima/ultimaReuniaoAt
                     │
                     ▼
   cadencia-core.ts (régua A30/B90/C180) → proximoContatoAt → termômetro/alertas

   ── Match por telefone/e-mail (compartilhado) ─────────────────
   cliente-matching.ts + phone.ts  ←  DataCrazy/WhatsApp, Google, Outlook
        (DataCrazy-ingest tem uma CÓPIA privada da lógica — duplicação consciente)

   ── DataCrazy = base do WhatsApp ──────────────────────────────
   WhatsApp NÃO existe como módulo; Conversa/Mensagem vêm 100% do DataCrazy

   ── Ilhas isoladas (baixo acoplamento) ────────────────────────
   Plaud/Zapier → tabela `Meeting` (SEPARADA de ReuniaoCliente — 2 sistemas de reunião paralelos)
   ManyChat     → tabela `Lead` (outbound puro, sem webhook)
   BTG          → MovimentacaoBtg + saldoConta/cadastrais em ClienteBackoffice (sem laço com Google)

   ── Log compartilhado ─────────────────────────────────────────
   BtgSyncLog é reusada como log de TODOS os syncs (Google, Outlook, DataCrazy, BTG)
```

**Acoplamentos com o Google (resumo):**
- `crypto.ts`/`GOOGLE_TOKEN_ENC_KEY` cifra tokens de Google **e** Microsoft — apesar do nome "GOOGLE_". Girar/perder a key inutiliza os dois.
- `agregador.ts` une Google + Microsoft no Painel do Dia via tipos comuns (`EventoAgenda`/`EmailAcao`).
- `ReuniaoCliente` + `reunioes.ts` + `reunioes-cleanup.ts` são compartilhados por Google, Outlook e DataCrazy.
- Lógica de match (telefone/e-mail) é a mesma família usada por Google, Outlook e DataCrazy/WhatsApp.

---

## C. Top riscos priorizados

### C1 — Perda de dados (prioridade máxima)
1. **BTG: cascade-delete silencioso de `MovimentacaoBtg`.** `MovimentacaoBtg.cliente` é `onDelete: Cascade` (`prisma/schema.prisma:764`). Três rotas deletam `ClienteBackoffice` e apagam movimentações junto: `clientes/route.ts:972` (`deleteMany()` total), `clientes/cleanup-leading-zeros/route.ts:188` (migra reuniões/observações mas **esquece** as movimentações) e `clientes/[id]/route.ts:74`. O backup é **semanal** e a API BTG não recupera histórico antigo → perda invisível e irreversível.
2. **Cleanup de reuniões em "fonte respondeu 200 vazia".** A guarda `fetchOk` (`reunioes-cleanup.ts`) protege bem contra *exceção* no fetch (já evitou repetir o incidente das 171 reuniões apagadas). Mas se a fonte devolver HTTP 200 com corpo vazio, `fetchOk=true` + nenhum `externalId` visto → o cleanup apaga **toda** a janela. Vetores reais: **Outlook ICS** (`outlook-ics.ts:26` só lança em `!res.ok`) e, em menor grau, DataCrazy Atividades.
3. **Plaud/`Meeting` sem `@@unique`.** `Meeting.externalId` não tem unique (`schema.prisma:377`); dedup é `findFirst`+`create` em código. Retry do Zapier (timeout da análise IA síncrona) ⇒ duplicação. `sync-drive` tem a mesma falha e grava na mesma tabela.

### C2 — Auth / token
4. **Webhooks fail-open.** DataCrazy (`webhooks/datacrazy/route.ts:67-71`), Zapier/Plaud (`zapier.ts:11-17`) e BTG (`webhooks/btg/route.ts`) **aceitam qualquer requisição se o secret não estiver setado**. `sync-drive` não valida secret nenhum — endpoint público que grava transcrições.
5. **Segredos em texto plano em `.integrations.json`** (raiz): `MICROSOFT_CLIENT_SECRET`, `MANYCHAT_API_TOKEN`. Está no `.gitignore` (não versionado), **mas** vive em pasta iCloud sincronizada — exposição via backup/sync, não via git. `config.ts` dá **precedência ao arquivo sobre a env**, o que incentiva persistir segredo no disco. Recomendação: rotacionar e mover para Railway env.
6. **OAuth na migração de domínio.** `redirect_uri` de Google e Microsoft deriva do host do request (`resolveOrigin`, sem hardcode) — bom. Mas as URIs do domínio NOVO precisam ser **cadastradas no Google Cloud Console e no Azure App**, senão o consentimento falha (`redirect_uri_mismatch` / `AADSTS50011`). Token de refresh do Microsoft expira em 90 dias (rotação já persistida); Google é ~indefinido.

### C3 — Webhooks/URLs no domínio antigo
7. **`APP_BASE_URL`** (GitHub Actions Variable que os crons usam) está **documentada apontando para o domínio ANTIGO** em `cron.yml:14`. Se nunca foi atualizada, todos os crons batem no domínio antigo (funciona enquanto ele existir, mas precisa migrar).
8. **Doc-comments com domínio antigo:** webhook DataCrazy (`webhooks/datacrazy/route.ts:18`) e placeholders `http://SEU-DOMINIO` no Zapier. Não quebram runtime, mas confundem reconfiguração.
9. **Webhooks externos a verificar manualmente** (URL mora fora do repo): portal **BTG**, painel **Zapier** e painel **DataCrazy** — confirmar se já apontam para `www.ecossistemaonix.com.br`.

### C4 — Crons fantasma (dívida silenciosa)
10. `cron.yml` agenda `/api/cron/auto-encerrar`, `/api/cron/triar-emails` e `/api/cron/boot-do-dia` — **nenhuma dessas rotas existe**. Retornam 404 a cada tick, mascarados porque o workflow nunca dá `exit 1`. Efeito: não há triagem proativa de e-mails nem auto-encerramento de reuniões em background.
11. `cadencia-backfill` existe mas **não está agendado** em lugar nenhum → clientes novos ficam com `proximoContatoAt = NULL` (cadência parada) até alguém chamar a rota à mão.

---

## D. Recomendação de fronteiras de módulo (para o reorg)

Derivada direto do mapa (seção B):

**Núcleos compartilhados — extrair como módulos próprios, NÃO colocar dentro de uma integração:**
- `crypto`/`secrets` — cifra de tokens OAuth (hoje `crypto.ts` com `GOOGLE_TOKEN_ENC_KEY`). Transversal a Google + Microsoft. Renomear a env quebra prod.
- `reunioes` (ou `relacionamento`) — `ReuniaoCliente` + `reunioes.ts` + `reunioes-cleanup.ts` + `recomputeAgregadosBatch`. É o hub de Google/Outlook/DataCrazy. A guarda `fetchOk` é **invariante de segurança**: qualquer refactor deve preservar "fetch falho ⇒ cleanup não apaga".
- `cadencia` — `cadencia-core.ts` é puro e importado no client (termômetro); **não** pode ganhar `prisma`/`server-only`.
- `matching` — `cliente-matching.ts` + `phone.ts`. Unificar a cópia privada que existe em `datacrazy-ingest.ts`.
- `painel-do-dia` — tipos `EventoAgenda`/`EmailAcao` neutros; Google e Microsoft implementam o mesmo contrato (provider pattern).
- `SyncLog` — renomear `BtgSyncLog` (hoje log genérico de todos os syncs; consumido por `sync-logs`).

**Integrações que viram módulos com interface fina (I/O isolado, lógica de negócio fora):**
- `integrations/google/` — OAuth + clientes Calendar/Gmail. Matching, sync↔clientes e triagem ficam fora (hoje `google-fetch.ts` mistura I/O com heurística).
- `integrations/microsoft/` — separar em DOIS: "Graph per-user" (Painel) vs "Outlook ICS admin" (backoffice). Compartilham só o nome.
- `integrations/btg/` — cliente + polls + reconciliação. Já é bem isolado de Google.

**Ilhas que podem ser tratadas por último / módulos autônomos simples:**
- `integrations/manychat/` — outbound puro, sem webhook/cron/domínio a migrar.
- `integrations/plaud-zapier/` — mas **decidir antes** se `Meeting` se funde em `ReuniaoCliente` (hoje são dois sistemas de reunião paralelos).
- **WhatsApp NÃO deve virar módulo próprio** — é submódulo do DataCrazy ("DataCrazy → Conversas WhatsApp"). Só justificaria módulo separado se entrar um cliente z-API direto.

**O que quebraria se movido sem cuidado:**
- Mexer no unique `(userId, source, externalId)` de `ReuniaoCliente` ou na semântica de `userId=null` (sentinela global de Outlook/DataCrazy) quebra a idempotência das 3 fontes.
- Renomear `GOOGLE_TOKEN_ENC_KEY` ou `BtgSyncLog` exige migração coordenada (env de prod / schema).
- Alterar os tipos do Painel do Dia quebra Google e Microsoft simultaneamente.

---

## E. Escopo

Diagnóstico e mapa apenas. **Nenhuma correção proposta para execução**, nenhuma alteração de código, config, banco ou deploy foi feita. Único arquivo criado: este relatório.
