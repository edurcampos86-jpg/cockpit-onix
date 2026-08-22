# Plaud → Ecossistema: por onde a transcrição entra

Registro de uma investigação de 15/08/2026, feita para responder uma pergunta
simples — *"existe caminho mais simples que o Zapier?"* — e que voltou com uma
resposta que muda o que dá para construir.

Este arquivo existe para ninguém investigar de novo. Se a resposta mudar (o
Plaud lança API pública, ou passa a mandar transcrição por e-mail), **edite
aqui**; é o registro, não uma foto do dia.

---

## Resumo em três linhas

1. **O Plaud não tem API pública.** O que existe é **Plaud MCP** e **Plaud CLI**.
2. **O Plaud não manda transcrição por e-mail.** Só marketing, link de login e
   *recap* mensal.
3. Portanto o Zapier **não é uma peça desnecessária hoje** — é o único caminho
   automático disponível sem escrever integração contra CLI.

---

## Os três caminhos que existem hoje no código

| caminho | entra por | vira | chega na ficha do cliente? |
|---|---|---|---|
| **Zapier** (automático) | `POST /api/integracoes/zapier/webhook` | `Meeting` (ligado a `Lead`) | não por si só — ver a ponte abaixo |
| **Google Drive** | `POST /api/meetings/sync-drive` (exige sessão) | `Meeting` | não |
| **Import manual** | tela do Cockpit de Reunião | `ReuniaoEstruturada` + `ReuniaoImport` + `ClienteFato` | **sim** |

O caminho que entrega mais é o manual. A ponte de `/reunioes` → ficha
(`src/lib/reunioes/casar-cliente.ts`) liga o primeiro ao terceiro sem tirar a
conferência humana do meio.

---

## O que foi conferido, e como

### 1. "Ingestão por Email" serviria para a transcrição?

**Não como está.** `/admin/juridico/email-ingest` é específica de contratos:

- filtra por remetente de plataforma de assinatura (`clicksign`, `docusign`,
  `adobesign`…, em `src/lib/juridico/email-ingest.ts:37`);
- **exige anexo PDF**;
- o destino é fixo: `registrarUploadContrato` → hash, B2, cofre jurídico.

O motor em si é bom e reaproveitável (dedup por `gmailMessageId`, dedup por
hash do arquivo, extração por IA). O que impede o reúso não é o desenho — é a
falta de e-mail para ingerir, ver abaixo.

### 2. O Plaud manda a transcrição por e-mail?

**Não.** Varredura na caixa do Eduardo: **17 mensagens** de `plaud.ai` no
histórico, todas de três tipos — marketing/promoção, link de login
(`no-reply@plaud.ai`) e *recap* mensal (`hi@plaud.ai`, "Your Plaud recap just
dropped"). Nenhuma com transcrição, nenhuma com anexo de reunião.

Construir o ingestor de e-mail hoje seria um cano sem água entrando.

### 3. O Plaud tem API ou webhook nativo?

**API pública, não.** A própria central de ajuda do Plaud diz que não há API
pública, e aponta duas alternativas oficiais, anunciadas em 29/07/2026:

- **Plaud MCP** — servidor MCP que expõe as gravações a clientes de IA
  (Claude, ChatGPT, Cursor…). Bom para *perguntar* sobre reuniões.
- **Plaud CLI** — linha de comando que **baixa transcrições, resumos e áudio**
  da conta. É a peça que serviria para importação em lote: exportar uma semana
  de transcrições para uma pasta.

Fonte: [Plaud MCP](https://support.plaud.ai/hc/en-us/articles/57751078986265-Plaud-MCP)
· [Plaud CLI](https://support.plaud.ai/hc/en-us/articles/57751026815257-Plaud-CLI)
· [API access](https://support.plaud.ai/hc/en-us/articles/60726890231449-How-can-I-get-API-access-to-my-Plaud-data)
· docs em `docs.plaud.ai/plaud-mcp-cli/`.

---

## O que isso implica para a decisão

**Trocar o Zapier por e-mail: descartado**, por falta de e-mail.

**Trocar o Zapier por CLI: possível, não gratuito.** O CLI roda numa máquina,
não num serviço — precisaria de um lugar para rodar de hora em hora e de
credencial do Plaud guardada lá. Em troca, tira uma assinatura e um segredo
exposto na internet do caminho. A comparação honesta:

| | Zapier (hoje) | Plaud CLI |
|---|---|---|
| rota pública exposta | sim (`zapier/webhook`) | não |
| assinatura de terceiro | sim | não |
| onde roda | nuvem do Zapier | precisa de host (cron do Railway, Action agendada) |
| credencial | segredo do webhook | credencial da conta Plaud |
| esforço | zero (já existe) | integração nova |

**Enquanto isso não se decide, o Zapier fica** — e por isso as duas correções
de segurança dele valem: falhar fechado sem segredo (#354) e guardar o segredo
no banco em vez do arquivo efêmero (#356).
