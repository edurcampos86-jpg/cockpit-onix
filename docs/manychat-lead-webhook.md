# ManyChat → WhatsApp: aviso de lead do Instagram

Quando alguém escreve uma **palavra-gatilho** na DM do Instagram, o ManyChat
chama o Cockpit e o Cockpit manda um WhatsApp para o Eduardo. Nada é gravado no
banco — é só o aviso.

- **Endpoint:** `POST /api/manychat/lead` (`src/app/api/manychat/lead/route.ts`)
- **Canal de saída:** Z-API, o mesmo cliente dos alertas de cadência 12-4-2
  (`src/lib/integrations/datacrazy-send.ts`), destino `DATACRAZY_ALERTS_PHONE`
- **Gate:** flag `MANYCHAT_LEAD_ALERT` no Config DB, **default OFF**

---

## 1. Configurar o segredo (Railway)

Railway → projeto `cockpit-onix` → serviço da app → **Variables** →
`New Variable`:

| Nome | Valor |
|------|-------|
| `MANYCHAT_WEBHOOK_SECRET` | string aleatória longa — gere com `openssl rand -hex 32` |

O valor **não** vai para o Git. Se preferir trocar sem redeploy, a mesma chave
pode ser gravada na tabela `Config` (o `getConfig` lê o banco primeiro e o env
como fallback).

Sem essa variável a rota responde **401 para tudo** — ela fecha, não abre. Um
endpoint público que dispara WhatsApp sem segredo vira gerador de spam no
celular assim que a URL aparecer num print do painel.

## 2. Ligar a flag

A rota já pode ser publicada com a flag desligada: ela responde `200
{"ok":true,"enviado":false}` e nada é enviado. Para ligar, em
**/configuracoes → Flags**, virar `MANYCHAT_LEAD_ALERT`. Aceita
`1 | true | on | yes | sim`.

Desligar volta ao estado anterior sem resíduo.

## 3. Configurar o External Request no ManyChat

No **Flow Builder**, depois do passo que detecta a palavra-gatilho, adicionar
uma ação **External Request**:

**URL**

```
https://cockpit-onix-production.up.railway.app/api/manychat/lead
```

**Method:** `POST`

**Headers**

| Header | Valor |
|--------|-------|
| `Content-Type` | `application/json` |
| `X-Onix-Secret` | o mesmo valor de `MANYCHAT_WEBHOOK_SECRET` |

**Body** (Content Type: `application/json`) — os `{{...}}` são variáveis do
ManyChat; insira-as pelo botão de variável do painel, não digitando à mão:

```json
{
  "nome": "{{first_name}} {{last_name}}",
  "username_instagram": "{{ig_username}}",
  "palavra_gatilho": "{{palavra_gatilho}}",
  "texto_mensagem": "{{last_input_text}}",
  "origem": "instagram"
}
```

- `palavra_gatilho` é uma **Custom Field** sua — crie em *Settings → Fields* e
  preencha com o gatilho daquele fluxo (ex.: `BLINDAGEM`) num passo *Set
  Custom Field* antes do External Request. Com mais de uma campanha, é o que
  separa uma da outra no aviso.
- `origem` é um literal fixo. Mude por fluxo se quiser distinguir "bio",
  "anúncio", "comentário" — ele aparece na segunda linha da mensagem.
- Campo que não existir no seu fluxo pode ser omitido: o aviso mostra `—` no
  lugar. O que **não** funciona é mandar só `origem` — aí o Cockpit responde
  400, porque não haveria nada a avisar.

Use o botão **Test Request** do ManyChat para validar. Resposta esperada:
`200 {"ok": true, "enviado": true}`.

## 4. A mensagem que chega

```
🔔 Lead Instagram: Roberto Alves (@robertoalves) acionou BLINDAGEM: quero saber sobre blindagem patrimonial
origem: instagram
```

O trecho da DM é truncado em 300 caracteres (`LIMITE_TEXTO` em
`src/lib/manychat-lead/mensagem.ts`): o aviso serve para decidir se responde
agora, e DM longa empurra o nome e o gatilho para fora da prévia da
notificação do celular. A conversa inteira continua no ManyChat.

## 5. Respostas e o que fazer com cada uma

| Código | O que significa | O que fazer |
|--------|-----------------|-------------|
| `200 {"enviado": true}` | aviso enviado | nada |
| `200 {"enviado": false, "motivo": "flag desligada"}` | rota certa, flag OFF | ligar `MANYCHAT_LEAD_ALERT` |
| `400` | corpo não é JSON, ou os quatro campos do lead vieram vazios | conferir as variáveis do Body no painel |
| `401` **sem corpo** | header `X-Onix-Secret` ausente, errado, ou segredo não configurado no Railway | conferir o header e a variável |
| `401` **com** `{"error":"Not authenticated"}` | a rota não está na allowlist do middleware — a requisição nem chegou ao endpoint | não adianta trocar o segredo; ver abaixo |
| `502` | header e corpo certos, a Z-API é que recusou | conferir a integração DataCrazy/Z-API em `/integracoes` |

`502` em vez de `200` é deliberado: devolver sucesso quando o WhatsApp não saiu
esconderia a queda do canal atrás de um "Success" verde no painel do ManyChat,
e o aviso perdido não apareceria em lugar nenhum.

### Os dois 401 são de lugares diferentes

Todas as rotas do Cockpit passam por um middleware que exige sessão
(`src/proxy.ts`). Webhook nenhum tem sessão, então cada um precisa estar na
allowlist `ROTAS_PUBLICAS` (`src/lib/proxy-rotas.ts`) — é lá que
`/api/manychat/lead` é liberada, e é por isso que a liberação vem com o
segredo obrigatório na mesma PR: a rota é pública para a internet e quem a
autentica é o `X-Onix-Secret`, mais ninguém.

Na prática, olhe o **corpo** da resposta:

- **401 vazio** → chegou ao endpoint e o segredo não conferiu. Problema de
  header ou de variável.
- **401 com `{"error":"Not authenticated"}`** → parou no middleware, antes do
  endpoint. A rota saiu da allowlist. Nenhuma troca de segredo resolve.

## 6. Logs

Prefixo `[manychat-lead]` nos logs do Railway. Cada requisição registra o `@` do
Instagram e a palavra-gatilho, com o desfecho (enviado / falha / ignorado por
flag / 401 / 400).

**O texto da DM não é logado.** É conteúdo de conversa privada e o log do
Railway é retido e lido por ferramenta externa; o `@` é público e já basta para
achar a pessoa.

## 7. O que esta rota não faz

Não grava lead, não cria card no funil `/leads`, não escreve tabela nenhuma.
Persistir o lead é decisão separada — o caminho de import que já existe é
`POST /api/integracoes/manychat/sync`.
