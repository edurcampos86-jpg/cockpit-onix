# Integração Google — Calendar + Gmail

OAuth 2.0 multi-usuário para alimentar o **Painel do Dia** (`/backoffice/painel-do-dia`) com a agenda e os e-mails de cada usuário do Cockpit Onix.

> Esta integração convive com o fluxo single-user legado em
> `src/lib/integrations/google-calendar.ts` (sync de posts editoriais e sync
> de reuniões com clientes). As duas pilhas são independentes.

## O que ela faz

| Bloco do painel | Fonte | Lib |
|---|---|---|
| **Agenda** | `calendar.events.list` (calendário primário, janela do dia em America/Bahia) | `src/lib/painel-do-dia/google-fetch.ts` |
| **E-mails que pedem ação** | `gmail.users.messages.list` (não lidos, últimas 24h, `-promotions -social`) com filtro heurístico | mesmo arquivo |

A heurística "pede ação" considera o e-mail relevante se:

- Assunto contém `?`, **OU**
- Destinatário direto inclui o usuário (não bcc/cc puro), **OU**
- Assunto ou snippet contém regex: `preciso | urgente | favor | quando | aguardo | por gentileza | pode | consegue | prazo | retorno | responder | confirme | confirmar`.

A lista é cortada nos 10 mais recentes; o card mostra o link "Ver todos no Gmail".

## Escopos (princípio do menor privilégio)

| Escopo | Por quê |
|---|---|
| `openid` `email` `profile` | descobrir o e-mail da conta conectada para mostrar na UI |
| `https://www.googleapis.com/auth/calendar.readonly` | listar eventos do dia (sem write) |
| `https://www.googleapis.com/auth/gmail.readonly` | ler subject/snippet/from/to (sem enviar, sem modificar) |

Definidos em `src/lib/integrations/google-user-oauth.ts` na constante `GOOGLE_SCOPES`.

## Variáveis de ambiente

Adicione no `.env.local` (dev) e no Railway (prod):

```bash
# Credenciais OAuth do projeto Google Cloud (mesmas usadas pelo fluxo legado)
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

# Novas para o fluxo multi-usuário:
# - GOOGLE_TOKEN_ENC_KEY: cifra os refresh/access tokens em repouso (AES-256-GCM)
# - GOOGLE_OAUTH_STATE_SECRET: assina o JWT do state OAuth (CSRF)
GOOGLE_TOKEN_ENC_KEY=<base64 de 32 bytes>
GOOGLE_OAUTH_STATE_SECRET=<base64 de 32 bytes>
```

Geração:

```bash
node -e 'console.log("GOOGLE_TOKEN_ENC_KEY="+require("crypto").randomBytes(32).toString("base64"))'
node -e 'console.log("GOOGLE_OAUTH_STATE_SECRET="+require("crypto").randomBytes(32).toString("base64"))'
```

> ⚠️ **Backup obrigatório do `GOOGLE_TOKEN_ENC_KEY`**: se for perdido, todos os
> `UserGoogleAuth.refreshTokenEnc` ficam ilegíveis e cada usuário precisa
> reconectar.

## Configurando o Google Cloud Console

1. Acesse https://console.cloud.google.com/apis/credentials no projeto que já contém o `GOOGLE_CLIENT_ID` legado (ou crie um novo se ainda não tem).
2. **Habilite as APIs** no projeto:
   - **Google Calendar API**
   - **Gmail API**
3. Em **Credentials → OAuth 2.0 Client ID** (tipo Web application), em *Authorized redirect URIs* adicione:
   - `http://localhost:3000/api/integracoes/google/connect-callback`
   - `https://<seu-dominio>/api/integracoes/google/connect-callback` (ex.: `https://cockpit-onix-app-production.up.railway.app/...`)
4. Em **OAuth consent screen**:
   - User type: **External** (ou Internal se for Workspace).
   - Scopes: adicione `openid`, `email`, `profile`, `Calendar API .../auth/calendar.readonly`, `Gmail API .../auth/gmail.readonly`.
   - Em desenvolvimento, deixe o app em **Testing** e adicione os e-mails internos como Test Users.
5. Salve.

## Banco de dados

Modelo `UserGoogleAuth` (1:1 com `User`):

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | cuid | PK |
| `userId` | string | unique, FK → `User` (`onDelete: Cascade`) |
| `googleEmail` | string | mostrado na UI |
| `refreshTokenEnc` | text | AES-256-GCM (`src/lib/crypto.ts`) |
| `accessTokenEnc` | text? | cache opcional, cifrado |
| `accessTokenExpiresAt` | timestamptz | |
| `scopes` | text | CSV dos escopos concedidos |
| `connectedAt` | timestamptz | |
| `lastUsedAt` | timestamptz? | atualizado por `touchGoogleAuthUsage` |
| `lastError` | text? | guardado bruto na DB, sanitizado para enum na API `/status` |
| `lastErrorAt` | timestamptz? | |

Aplicação:

```bash
npx prisma migrate deploy
# ou em dev:
npx prisma db push
```

A migration SQL fica em `prisma/migrations/20260519120000_user_google_auth/migration.sql`.

## Rotas

| Rota | Método | Autenticação | Função |
|---|---|---|---|
| `/api/integracoes/google/connect` | GET | Sessão | Gera `authUrl` + seta cookie `g_oauth_nonce` (httpOnly) |
| `/api/integracoes/google/connect-callback` | GET | State JWT + cookie | Troca code por tokens, cifra e persiste |
| `/api/integracoes/google/status` | GET | Sessão | `{connected, email, scopes, lastError?, lastErrorAt?}` |
| `/api/integracoes/google/disconnect` | POST | Sessão | Revoga no Google e apaga local |
| `/api/painel-do-dia/agenda?data=YYYY-MM-DD` | GET | Sessão + rate-limit | Eventos do dia |
| `/api/painel-do-dia/emails` | GET | Sessão + rate-limit | E-mails que pedem ação |

Rate limit: **60 req/h por usuário/rota** (in-memory por processo — anotado como débito para escalar).
`/connect` tem limite mais agressivo (**10/h**) para prevenir flood de inits.

## Segurança

- **Tokens em repouso:** cifrados com AES-256-GCM, IV de 12 bytes random por chamada, tag verificada no decrypt. Implementado em `src/lib/crypto.ts`.
- **State CSRF:** JWT HS256 com `userId + nonce`, TTL 10 min. O nonce também vai em cookie `httpOnly` com path `/api/integracoes/google` (double-submit). O callback compara em tempo constante.
- **Revogação:** `disconnect` chama `oauth2Client.revokeToken(refreshToken)` antes do `prisma.delete`.
- **Tokens em logs:** nunca. Só `error.name` no handler de rotação. `lastError` é sanitizado para enum (`expired | network | rate_limit | unknown`) antes de virar resposta da API.
- **Multi-usuário:** todas as chamadas usam `session.userId` server-side; não há userId vindo do client em parâmetro.

## Como rodar localmente

```bash
# 1. Variáveis de ambiente prontas em .env.local
# 2. DB rodando + migration aplicada
npx prisma db push

# 3. Dev server
npm run dev

# 4. Logar em http://localhost:3000/login
# 5. Ir em /integracoes, expandir o card "Google (Calendar + Gmail)"
# 6. Clicar "Conectar Google", autorizar
# 7. Voltar em /backoffice/painel-do-dia
```

## Teste manual com curl

Pegue o cookie `session` no DevTools depois de logar:

```bash
S='session=<seu-cookie>'

# Status (esperado: {connected:false} antes de conectar)
curl -s http://localhost:3000/api/integracoes/google/status -H "Cookie: $S" | jq

# Pegar URL de consentimento (abrir no browser)
curl -s http://localhost:3000/api/integracoes/google/connect -H "Cookie: $S" | jq -r .authUrl

# Conferir conexão
curl -s http://localhost:3000/api/integracoes/google/status -H "Cookie: $S" | jq

# Agenda do dia
curl -s "http://localhost:3000/api/painel-do-dia/agenda" -H "Cookie: $S" | jq

# E-mails
curl -s http://localhost:3000/api/painel-do-dia/emails -H "Cookie: $S" | jq

# Confirmar que o refresh_token NÃO está em claro:
psql $DATABASE_URL -c 'SELECT id,"googleEmail",scopes,"connectedAt",LENGTH("refreshTokenEnc") FROM "UserGoogleAuth";'

# Desconectar
curl -s -X POST http://localhost:3000/api/integracoes/google/disconnect -H "Cookie: $S" | jq
```

## Histórico — Migração do fluxo legado (Fase 2 / 2026-05)

Antes existia um token Google "admin global" salvo em `.integrations.json`
como `GOOGLE_REFRESH_TOKEN`. **Foi removido.** Hoje TODO acesso ao Google
(Calendar + Gmail, leitura e escrita) passa por `UserGoogleAuth`:

- `src/app/api/posts/route.ts` / `[id]/route.ts` — sync usa `post.authorId`.
- `src/app/api/integracoes/google/sync/route.ts` — itera posts e usa `post.authorId`.
- `src/app/api/integracoes/google/test/route.ts` — usa `session.userId`.
- `src/lib/google-calendar-clientes-sync.ts` — recebe `userId` no contrato.
- `src/app/api/cron/google-calendar-poll/route.ts` — itera `UserGoogleAuth.findMany()`.

Rotas legadas removidas: `/api/integracoes/google/auth` e `/api/integracoes/google/callback`.

Escopos atuais: `calendar.readonly` + `calendar.events` + `gmail.readonly`.
Usuários conectados ANTES da Fase 2 precisam clicar "Conectar" novamente
para autorizar o escopo `calendar.events`.

Schema mudou: `ReuniaoCliente` agora carrega `userId` opcional (`@@unique([userId, source, externalId])`)
para que dois usuários com o mesmo `event.id` não colidam.

## Cenários de erro e o que o usuário vê

| Situação | Onde acontece | UI |
|---|---|---|
| Usuário ainda não conectou | qualquer chamada | Empty state + CTA "Conectar Google" |
| Token revogado em myaccount.google.com | rotação automática falha com `invalid_grant` | `/status` retorna `lastError: "expired"`; UI mostra "Sessão expirada — reconecte sua conta" |
| Escopo recusado na consent | callback recebe `error=access_denied` | Banner vermelho na página de Integrações |
| Limite de 60/h excedido | rotas `/painel-do-dia/*` | 429 + banner "Erro ao atualizar: limite de requisições excedido" |
| `GOOGLE_TOKEN_ENC_KEY` ausente | qualquer chamada | 500 com mensagem instrutiva |
| `state` replayado fora da janela | `/connect-callback` | redirect `?google_error=invalid_state` |

## Débito técnico anotado

- Rate limit hoje é in-memory por container. Trocar por Redis/Postgres se
  Railway escalar para múltiplos workers.
- Persistir também erros 403/insufficient-scope em `lastError` (hoje só
  `invalid_grant` aciona).
- Triagem AI dos e-mails (Fase 1) roda inline no GET; sob carga, partir
  para fila + paralelismo (`p-limit`) ou cron dedicado em vez de inline.
- Outlook ICS e Datacrazy ainda escrevem `ReuniaoCliente` com `userId=NULL`
  (escopo global). Quando o fluxo Microsoft Graph for per-user (Fase 4),
  ele também passa a escopar por `userId` e o NULL vira sentinela só de
  fontes verdadeiramente compartilhadas.
