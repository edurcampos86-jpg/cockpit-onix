# Agentes do Cockpit Onix

Conjunto de subagentes Claude Code para apoiar **atualização, utilização, controle e auditoria** do Ecossistema Onix.

## Como invocar

Dentro do Claude Code, peça por nome ou pelo gatilho descrito em cada agente:

```
> Roda o migration-doctor antes do deploy.
> Faz o release-gate na branch atual.
> Copiloto, qual a minha 1ª prioridade hoje?
```

Ou explicitamente com `Agent(subagent_type="nome-do-agente", ...)`.

## Catálogo

| Agente | Tipo | Quando usar |
|---|---|---|
| [migration-doctor](migration-doctor.md) | On-demand / pré-deploy | Confere drift entre `schema.prisma`, migrations e DB de produção. |
| [import-guardian](import-guardian.md) | On-demand | Orquestra imports BTG (Base, Saldo CC, Informações, Receita) com dry-run, match seguro e rollback. |
| [integration-healthcheck](integration-healthcheck.md) | Cron (a cada 30min) | Bate em `/api/integracoes/status` + endpoints `/test` e crons; notifica Slack + WhatsApp se algo cair. |
| [tutorial-keeper](tutorial-keeper.md) | On-demand / mensal | Compara `src/app/**/page.tsx` com `TUTORIAL.md` e propõe atualização. |
| [audit-trail-clientes](audit-trail-clientes.md) | On-demand + semanal | Implementa/lê audit log de mutações em `ClienteBackoffice` e produz relatório semanal. |
| [copiloto-painel-do-dia](copiloto-painel-do-dia.md) | On-demand (diário) | Dispara boot-do-dia, triagem de e-mails, focus blocks e retrospectiva sem você lembrar dos endpoints. |
| [release-gate](release-gate.md) | Pré-push / pré-PR | Roda `npm run build`, eslint e revisa diff focando em zonas críticas (backoffice/clientes, imports). |
| [security-sweep](security-sweep.md) | Pré-release / mensal | Varredura focada em segredos commitados, rotas admin sem gate, exposição de CPF em logs. |
| [reunioes-sync-monitor](reunioes-sync-monitor.md) | On-demand + semanal | Dono do pipeline de reuniões (4 fontes → ReuniaoCliente → agregados). Diagnostica "por que X não aparece com próx reunião?", audita dedupe e gera gap report. |

## Configuração de notificações (Slack + WhatsApp)

Os agentes de cron (`integration-healthcheck`, `audit-trail-clientes` semanal) enviam alertas em dois canais.

**Slack** — preencha em `.env.local` (ou `Config` no DB):
```
SLACK_ALERTS_CHANNEL=    # ex: #cockpit-onix-alertas
SLACK_AUDIT_CHANNEL=     # ex: #cockpit-onix-auditoria
```

**WhatsApp via Datacrazy** — preencha:
```
DATACRAZY_ALERTS_PHONE=  # número do Eduardo no formato 5571999999999
DATACRAZY_ALERTS_INSTANCE= # instanceId Datacrazy a usar
```

O agente lê esses valores via `getConfig()` em `src/lib/config-db.ts`. Se vazios, ele apenas reporta no chat sem enviar.

## Convenções compartilhadas

- **Sempre tratar matching de cliente** com a regra existente do projeto: CPF/CGE/e-mail/telefone como chave forte, nome apenas como confirmação. Ver `feedback_matching_cliente` no auto-memory.
- **Nunca rodar mutações destrutivas sem confirmar** com Eduardo (drop, truncate, unique-violation overwrite).
- **Não pisar em prod**: agentes que leem prod fazem `read-only`; mudanças são via PR + migration.
- **Linguagem**: respostas em pt-BR, tom direto, sem emoji.
