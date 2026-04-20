# Painel do Dia — Protocolo Cowork (Chrome MCP)

**Status:** v1, manual on-demand. Sem scheduled jobs.

## Contexto

As fontes **Microsoft (Outlook + To Do)** e **Priority Matrix (Appfluence)**
não usam OAuth backend no cockpit. O tenant Microsoft corporativo do BTG
bloqueia app registration, e Priority Matrix não tem API pública aberta.

Em vez disso, o Claude Code do Eduardo, rodando na máquina dele com a
extensão Chrome MCP conectada, abre as apps web dessas fontes, lê/escreve
dados, e fala com o cockpit via endpoints REST.

## Gatilho

Dois caminhos disparam o procedimento:

**1. Fala explícita do Eduardo:**
- "sincroniza Microsoft agora"
- "sincroniza Priority Matrix agora"
- "sincroniza tudo agora"

**2. Botão "Sincronizar" no próprio painel**:
- Cria uma `SyncRequest` (status `pending`) via `POST /api/painel-do-dia/sync-request`
- Ao abrir o Claude Code na máquina do Eduardo, **checar a fila antes de qualquer outra
  coisa**: `GET /api/painel-do-dia/sync-request`. Se houver pendentes, processar.

**Não há polling automático** — é sempre on-demand (fala ou request enfileirada).

### Gestão da fila de SyncRequest

```
GET    /api/painel-do-dia/sync-request           -> { pendentes: SyncRequest[] }
POST   /api/painel-do-dia/sync-request           body: { sources: "all" | "microsoft" | "priority-matrix" }
PATCH  /api/painel-do-dia/sync-request/[id]      body: { status, error? }
```

Fluxo típico:
1. Marcar como `in-progress` (PATCH status).
2. Executar o procedimento da seção abaixo.
3. Marcar como `done` (ou `error` com mensagem) ao finalizar.

Requests duplicadas pras mesmas fontes são idempotentes (POST devolve a existente).

## Procedimento completo

### 1. Autenticar-se no cockpit

O endpoint exige cookie `session` (JWT). Se o Claude não tiver sessão,
pedir para o Eduardo fazer login no cockpit e copiar o cookie, ou reautenticar
no navegador controlado pelo Chrome MCP.

### 2. Drenar fila de writes pendentes (write-back)

```
GET {COCKPIT_BASE_URL}/api/painel-do-dia/cowork-sync
```

Resposta:
```json
{ "pendentes": [ AcaoPainel, ... ] }
```

Cada `AcaoPainel` traz `syncOp` ∈ `"create" | "update" | "delete"`, `origem`,
`externoId?` e os campos a aplicar.

### 3. Aplicar cada write na origem

- **`origem: "ms-todo"`**
  - Navegar para `https://to-do.live.com/`
  - `create` → criar task na lista "Tasks" (ou "Meu Dia" se `noMeuDia`)
    com `titulo`, `dueDate` (se `vence`), `importance` (se `importante`)
  - `update` → localizar task por `externoId`, aplicar mudanças
  - `delete` → localizar e deletar

- **`origem: "priority-matrix"`**
  - Navegar para `https://app.appfluence.com/`
  - `create` → abrir projeto `projetoPm` (ou projeto padrão), adicionar
    item no quadrante `quadrante` (Q1/Q2/Q3/Q4) com `titulo` e `dueDate`
  - `update` → localizar por `externoId`, atualizar
  - `delete` → localizar e deletar

Após aplicar com sucesso, capturar o `externoId` da fonte e reportar.

### 4. Ler estado atualizado + reportar no cockpit

Fazer um POST para `/api/painel-do-dia/cowork-sync` com o payload completo:

**Para Microsoft Calendar (read-only):**
```json
{
  "source": "ms-calendar",
  "syncedAt": "2026-04-20T13:40:00-03:00",
  "items": [
    {
      "id": "cal-123",
      "origem": "ms-calendar",
      "titulo": "Reunião com cliente",
      "inicio": "2026-04-20T14:00:00-03:00",
      "fim": "2026-04-20T15:00:00-03:00",
      "linkReuniao": "https://teams.microsoft.com/...",
      "organizador": "fulano@btgpactual.com"
    }
  ]
}
```

**Para Microsoft Mail (read-only):**
```json
{
  "source": "ms-mail",
  "syncedAt": "2026-04-20T13:40:00-03:00",
  "items": [
    {
      "id": "mail-456",
      "origem": "ms-mail",
      "remetente": "cliente@empresa.com",
      "assunto": "Pede ação — revisão proposta",
      "snippet": "...",
      "link": "https://outlook.office.com/mail/inbox/id/...",
      "recebidoEm": "2026-04-20T13:20:00-03:00"
    }
  ]
}
```

**Para MS To Do / Priority Matrix (com write-back):**
```json
{
  "source": "ms-todo",
  "syncedAt": "2026-04-20T13:40:00-03:00",
  "items": [
    {
      "id": "cmo7jjotf0002en1mqglzs40q",
      "externoId": "AAMkA...",
      "titulo": "Ligar pro cliente X",
      "concluida": false,
      "vence": "2026-04-20T18:00:00-03:00",
      "importante": true,
      "noMeuDia": true
    }
  ]
}
```

Campo `id` **obrigatório quando fechando o loop de um pending create** — é o id local
da `AcaoPainel` devolvido pelo `GET /cowork-sync`. Sem ele o cockpit acha que é uma
leitura nova da fonte e cria registro duplicado. Para leituras puras (itens que já
existem só na fonte), enviar só `externoId`.

O cockpit correlaciona por `id` local (prioridade) ou por `(userId, origem, externoId)`
e limpa `pendingSync`.

### 5. Escopo de extração

- **Calendar**: eventos de hoje (00:00–23:59 America/Bahia), todas as agendas
- **Mail**: inbox não-lida dos últimos 3 dias com heurística "pede ação"
  (remetente externo, "?" no assunto, flag Outlook)
- **To Do**: lista "Tasks" + itens em "Meu Dia" + qualquer item com due date hoje
- **Priority Matrix**: os 4 quadrantes de todos os projetos, mais itens com
  due date hoje, quadrante Q1 explicitado

### 6. Erros

Se uma aplicação na origem falhar, reportar via PATCH individual:
```
PATCH /api/painel-do-dia/acoes/[id]
Body: { "syncError": "mensagem" }
```

Isso deixa a badge de erro visível no painel e o usuário decide.

## Troubleshooting

- **Cookie de sessão expirado**: pedir login no cockpit
- **Outlook Web pede MFA**: avisar o Eduardo — ele faz o passo manual, depois
  reiniciar o procedimento
- **Priority Matrix deslogado**: idem Outlook
- **DOM mudou (layout novo)**: este doc precisa ser atualizado; abrir issue
  com screenshot

## Endpoints resumidos

| Método | Rota | Uso |
|---|---|---|
| GET | `/api/painel-do-dia/cowork-sync` | Lista pendingSync |
| POST | `/api/painel-do-dia/cowork-sync` | Ingestão de payload |
| PATCH | `/api/painel-do-dia/acoes/[id]` | Reportar syncError |
