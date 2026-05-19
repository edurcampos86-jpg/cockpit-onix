# Painel do Dia — Fase 0 (Google) e o que vem depois

Documento de fechamento da Fase 0 do roadmap do Painel do Dia (`/backoffice/painel-do-dia`). Captura o que foi entregue, o que ficou de fora propositadamente, e as candidatas a Fase 1.

## ✅ Entregue na Fase 0

- OAuth 2.0 multi-usuário do Google (Calendar + Gmail) — cada usuário conecta a própria conta.
- Tabela `UserGoogleAuth` com tokens cifrados em AES-256-GCM.
- State CSRF JWT + double-submit cookie httpOnly.
- Bloco "Agenda" do painel agora consome o Google Calendar do dia.
- Bloco "E-mails que pedem ação" agora consome o Gmail das últimas 24h com heurística.
- Card "Google (Calendar + Gmail)" em `/integracoes` com Conectar / Reconectar / Desconectar.
- `IntegracoesStatus` (Fontes do Painel) reporta status real do Google (conectado/desconectado/erro), não mais "em-breve".
- Indicador "atualizado há X min" + botão Atualizar em cada bloco.
- Rate limit (60/h por usuário/rota; 10/h em `/connect`).
- README de operação: `src/app/api/integracoes/google/README.md`.

## ⛔ Fora desta fase — entra na próxima

### 1. Microsoft Graph multi-user (Outlook + To Do nativo)

Hoje a integração MS roda via **cowork** (Chrome MCP em `src/lib/painel-do-dia/cowork-sync.ts`). Faz sentido fazer o mesmo OAuth multi-tenant do Microsoft Graph:

- `https://graph.microsoft.com/Calendars.Read`
- `https://graph.microsoft.com/Mail.Read`
- `https://graph.microsoft.com/Tasks.ReadWrite` (To Do — bidirecional, complicado, deixar para depois)

Razão pra tirar do escopo: cada provider de OAuth tem peculiaridade (consent screen multi-tenant da Microsoft, `tenant=common`, refresh com `offline_access`), e duplicar a complexidade da Fase 0 deixaria a entrega mais arriscada.

### 2. Datacrazy CRM

Briefing do Painel já lista como "em-breve". Depende de credencial do banco e da decisão se vai consumir a API REST oficial ou o webhook (já tem ingest em `src/lib/datacrazy-ingest.ts`).

### 3. Plaud AI (transcrições) no Painel

Webhook Zapier → Plaud já existe em `src/lib/plaud.ts` mas não aparece como bloco do painel. Falta plugar como cartão "Última reunião gravada → ações sugeridas".

### 4. Migração do fluxo legado Google single-user

O `.integrations.json` ainda guarda `GOOGLE_REFRESH_TOKEN` global, usado por:

- `src/app/api/posts/route.ts` (POST/PATCH/DELETE) — sync de posts editoriais ↔ Calendar
- `src/app/api/integracoes/google/sync/route.ts` (Sincronizar Posts)
- `src/lib/google-calendar-clientes-sync.ts` — sync de reuniões com clientes
- `src/app/api/cron/google-calendar-poll/route.ts` — cron diário

Migrar para `UserGoogleAuth` exige decisão: qual usuário-dono do sync (admin global? primeiro admin conectado?). Por isso fica para fase seguinte.

### 5. Triagem AI dos e-mails do Gmail

`src/lib/painel-do-dia/triar-emails.ts` hoje só classifica o cache MS Mail. Estender para também rodar nos e-mails do Gmail (`PainelEmailAI` com `origem: "gmail"`) para que apareçam com `tipo`, `urgencia`, `quadranteSugerido` e botão "Criar ação" no mesmo padrão do Outlook.

### 6. Persistência de erros 403/insufficient-scope

Hoje só `invalid_grant` é gravado em `UserGoogleAuth.lastError`. Adicionar caso o usuário consinta com escopos parciais — UI já tem o slot `permission_denied` no enum (basta adicionar).

### 7. Rate limit distribuído

In-memory por container hoje. Se o serviço Railway escalar para múltiplos workers, mover para Redis ou Postgres.

### 8. Refresh proativo de tokens

Hoje o `googleapis` faz refresh on-demand quando uma chamada precisa. Para deixar o "atualizado há X min" mais consistente, podemos rodar um cron noturno (`/api/cron/google-refresh`) que toca `getGoogleClientForUser` para cada usuário ativo e atualiza `lastUsedAt` sem chamar nenhuma API real.

### 9. Logout no Google ao deletar User

`onDelete: Cascade` no `UserGoogleAuth` já apaga a linha quando o usuário some, mas **não revoga** no Google. Adicionar trigger ou hook na rota de deleção de usuário.

## Métricas de saúde sugeridas (para o agent `integration-healthcheck`)

- % de usuários ativos com Google conectado nos últimos 7 dias.
- Tempo médio entre falhas de refresh (proxy de saúde do refresh token).
- Distribuição de `lastError` por código (expired / network / rate_limit / unknown).

## Convenção de commits dessa frente

Já alinhado com o resto do repo:

- `feat(painel): ...`
- `feat(google): ...`
- `fix(google-oauth): ...`
- `chore(google): ...`
