# Google OAuth Scope Justification — Ecossistema Onix

Texto pronto para colar no **Google Cloud Console → OAuth consent screen → Scopes → Justification** quando submeter o app à verificação (necessário antes de passar de 100 usuários ou para escopos sensitive/restricted).

App: **Ecossistema Onix** — plataforma interna de gestão da Onix Capital.

URLs públicas obrigatórias (já em produção):
- Privacy Policy: `https://<seu-domínio>/privacy`
- Terms of Service: `https://<seu-domínio>/terms`
- App home: `https://<seu-domínio>/`

---

## Escopos solicitados

| Scope | Sensitivity | Por que |
|---|---|---|
| `openid` + `email` + `profile` | non-sensitive | Identificar a conta Google que o assessor conectou (mostrado na tela `/integracoes` para confirmação visual). |
| `https://www.googleapis.com/auth/calendar.readonly` | sensitive | Ler eventos do Calendar primário para popular o "Painel do Dia" e cruzar reuniões agendadas com a base de clientes do assessor. |
| `https://www.googleapis.com/auth/calendar.events` | sensitive | Criar/atualizar/remover eventos no Calendar primário do assessor quando ele agenda um post editorial pelo módulo `/planejamento` do Onix. |
| `https://www.googleapis.com/auth/gmail.readonly` | restricted | Ler metadados (remetente, assunto, snippet) de e-mails não lidos das últimas 24h para destacar mensagens que pedem ação no "Painel do Dia". Não acessamos anexos, corpo completo nem enviamos e-mails. |

---

## Justificativas detalhadas (cole por escopo)

### `calendar.readonly` — Justification

> The Onix Ecosystem is an internal management platform for financial advisors at Onix Capital. Each advisor connects their own Google account via OAuth to populate the "Daily Panel" feature — a dashboard that surfaces the day's meetings and identifies emails that demand action.
>
> The `calendar.readonly` scope is required to read events from the advisor's primary calendar for two purposes:
> 1. Display today's meetings in the Daily Panel (no third-party storage; rendered live per request).
> 2. Cross-match meetings against the advisor's client base (`ClienteBackoffice` table) so the CRM aggregates `proximaReuniaoAt` and `ultimaReuniaoAt` per client. Matching is by attendee email when available, and a heuristic on the event title (with common-surname protection) as fallback.
>
> No calendar data is shared with third parties or used for advertising. Event titles and IDs may be stored in our database as part of the `ReuniaoCliente` cache (per-user scoped), encrypted in transit (TLS) and at rest (Railway-managed Postgres).

### `calendar.events` — Justification

> The Onix Ecosystem includes a `Planejamento` module where advisors schedule editorial posts (videos, stories, carrosséis) with date and time. When a post is created or updated, the system writes a corresponding event to the advisor's primary Google Calendar so the advisor has visibility of all editorial commitments in their main calendar app.
>
> The `calendar.events` scope is required to:
> 1. `events.insert` — create a new calendar event when a post is scheduled.
> 2. `events.update` — update title, date or time when the post is edited.
> 3. `events.delete` — remove the event when the post is deleted.
>
> Events created by Onix carry an emoji prefix (🎬/📱/🖼️) and a description that identifies them as originating from the Onix Ecosystem, so the advisor can recognize them.
>
> No third party can write to the calendar; only the authenticated advisor's own account. Events created for other purposes (personal events, meetings) are not modified.

### `gmail.readonly` — Justification

> The Onix Ecosystem's "Daily Panel" includes a block titled "Emails that demand action", surfacing up to 10 unread Gmail messages from the last 24 hours that look like they require a reply or follow-up (subject contains a question mark, the advisor is in the "To" field, or the body mentions action keywords like "urgent", "please", "when can you").
>
> The `gmail.readonly` scope is required ONLY for reading:
> - Message ID, From (sender), Subject, Snippet (preview of first ~200 characters), Received-At timestamp.
> - We do NOT fetch attachments.
> - We do NOT fetch the full message body — only the snippet that Gmail's API returns directly.
> - We do NOT send emails on the advisor's behalf (no `gmail.send` scope requested).
> - We do NOT modify labels (no `gmail.modify` requested).
>
> Snippets and metadata are passed to Anthropic's Claude API (server-to-server, no human review) for a classification step (`acao | fyi | spam | agendamento | cliente_novo`). The classification result and the snippet (truncated) are stored in our `PainelEmailAI` table, per-user scoped, encrypted at rest. The original email content stays in Gmail; we cache only what we need to render the Daily Panel.
>
> Users may disconnect at any time via `/integracoes` (revokes refresh token in Google and deletes the encrypted record from our database).

---

## How users grant and revoke access

- **Grant:** advisor clicks "Conectar Google" in `/integracoes`. Standard OAuth 2.0 consent screen shows all scopes; advisor approves explicitly.
- **Revoke (inside the app):** advisor clicks "Desconectar" in `/integracoes`. App revokes the refresh token via Google's revocation endpoint and deletes the encrypted token record.
- **Revoke (outside the app):** advisor visits <https://myaccount.google.com/permissions> and removes "Ecossistema Onix" access. Our next API call returns `invalid_grant`, which we detect and surface as "Sessão expirada — reconecte" in the UI.

## Limited Use compliance

Onix's use of information received from Google APIs adheres to the
[Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy),
including the Limited Use requirements. Specifically:

- We do not use Calendar or Gmail data to serve advertisements.
- We do not allow humans to read Google data, except (a) with the user's explicit consent for the specific case, (b) for security necessity (e.g., investigating abuse), or (c) to comply with a legal obligation.
- We do not transfer the data to third parties, except infrastructure providers under contract (Railway for hosting; Anthropic for the snippet-classification API call, which does not retain the snippets).

---

## Security posture

- Refresh tokens and access tokens are stored encrypted with **AES-256-GCM**. Key lives only in the server's secret manager.
- OAuth state JWT signed with **HS256**, TTL 10 min, plus double-submit cookie nonce to prevent replay.
- All API calls are server-to-server over TLS 1.2+.
- Per-user rate limiting on `/api/painel-do-dia/*` (60 requests/hour) to prevent abuse against Google's quota.
- Logs never include token contents — only encrypted field names and user IDs.

---

## Contact for the verification reviewer

- Technical: Eduardo Campos · <eduardo@onixcapital.com.br>
- Privacy / LGPD: <contato@onixcapital.com.br>
