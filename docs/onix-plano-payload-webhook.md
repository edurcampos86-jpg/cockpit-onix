# Plano 🔴 — tirar o payload do webhook de dentro de `BtgSyncLog.erros`

> **ESTE PLANO NÃO FOI EXECUTADO.** Nenhuma migration foi criada, nenhum backfill
> rodou, nada foi aplicado em produção. É um documento para o Eduardo ler e
> decidir. Faixa 🔴: mexe em coluna com dado real de produção.

---

## 1. Por que isto está aqui

`src/app/api/webhooks/btg/route.ts:53` grava, em toda chamada do webhook:

```ts
erros: { payload: body } as never,
```

A coluna se chama `erros`. O comentário do schema dizia — até 15/08 — "lista de
erros { conta, motivo }". Para `tipo='import'`, `'enrich'` e `'balances'` isso é
verdade. Para `tipo='webhook'` é falso: ali mora o **payload recebido**, dê certo
ou não.

**O custo já foi pago, e é o argumento inteiro deste plano.** Uma consulta de
auditoria escrita em 12/08 usava:

```sql
count(*) FILTER (WHERE erros IS NOT NULL) AS com_erros
```

e devolveu `com_erros = 15` sobre 15 linhas — ao lado de `com_sucesso = 15`. Os
dois números não se contradiziam: um contava "tem payload guardado" (todas), o
outro "deu certo" (todas). Mas o **rótulo** dizia erro. O 15 virou premissa de
que o webhook do BTG estava falhando, e o 15/08 inteiro foi gasto investigando
uma integração que estava saudável.

*É a mesma coisa que ler a coluna "prejuízo" de um extrato e descobrir depois que
o banco usava aquela coluna para guardar o número da ordem. O saldo estava certo
o tempo todo; o rótulo é que mentia — e é pelo rótulo que se decide.*

O comentário do schema já foi corrigido (PR #353). Comentário corrigido conserta
quem lê o schema; **não** conserta quem escreve SQL olhando só o nome da coluna,
que é como o erro aconteceu. A saída definitiva é a coluna própria.

---

## 2. O tamanho do problema — medido, não estimado

| medida | valor | de onde veio |
|---|---|---|
| linhas com `tipo='webhook'` | **15** | `estado-do-banco.yml`, consulta de auditoria, 15/08 |
| dessas, com `erros` não nulo | **15** (100%) | mesma consulta — o `com_erros=15` do incidente |
| linhas a mover no backfill | **15** | as mesmas 15 |
| período coberto | ~101 dias | `min(iniciado)` a `max(iniciado)` |
| linhas com `tipo='webhook'` e erro real | **0** | `sucesso=false` = 0, `contasComErro>0` = 0 |

**15 linhas.** O backfill é trivial em volume. O risco não está no tamanho — está
em fazer uma coluna nova e um writer novo divergirem no meio do caminho.

> ⚠️ Os 15 são de **15/08/2026**. O webhook continua recebendo chamadas. Reconferir
> o número na hora de executar, com a mesma consulta — plano com número velho é
> o mesmo defeito que este plano existe para corrigir.

---

## 3. A migration

```sql
-- prisma/migrations/<timestamp>_btgsynclog_payload/migration.sql
ALTER TABLE "BtgSyncLog" ADD COLUMN "payload" JSONB;
```

No schema:

```prisma
model BtgSyncLog {
  // ...
  erros   Json? // erros reais { conta, motivo } — ver etapa 3 do plano
  payload Json? // o que a origem enviou (hoje: webhook BTG)
}
```

**Uma coluna nullable, sem default, sem NOT NULL, sem índice.** Isso passa nos dois
guards que o CI já tem (`guarda-not-null-sem-default.sh` e `guarda-drift-fts.sh`)
e não reescreve a tabela — `ADD COLUMN` nullable no Postgres 11+ é metadado, não
varre linha. Tempo de lock: desprezível em 15 linhas, e desprezível mesmo se
fossem 15 milhões.

O backfill:

```sql
UPDATE "BtgSyncLog"
SET "payload" = "erros"
WHERE tipo = 'webhook' AND "erros" IS NOT NULL;
-- esperado: UPDATE 15  (reconferir antes; ver §2)
```

**Fora da migration.** A migration cria a coluna; o backfill é passo separado,
rodado à mão com o número esperado na frente. `migrate deploy` que também move
dado é `migrate deploy` que não se pode repetir sem pensar.

---

## 4. As duas etapas, e por que duas

O plano é executável em duas etapas independentes, cada uma segura sozinha. Isso
importa porque a etapa 1 pode ficar semanas no ar sem a etapa 2, sem risco.

### Etapa 1 — coluna nova, escrita dupla (🟡)

1. `ADD COLUMN "payload" JSONB` (a migration acima).
2. Backfill das 15 linhas.
3. `webhooks/btg/route.ts:53` passa a escrever **nas duas**:
   ```ts
   payload: { payload: body },
   erros: { payload: body } as never,   // mantido nesta etapa
   ```

Reversível a custo zero: se algo der errado, a coluna nova é ignorada e nada
muda de comportamento. `erros` continua sendo a fonte que qualquer leitor usa.

*É a posição montada antes de desmontar a antiga — durante a transição, dois
lugares carregam a mesma informação de propósito.*

### Etapa 2 — parar de escrever em `erros` (🔴)

Só depois de confirmar que `payload` está preenchido em 100% das chamadas novas
(o teste é uma consulta: `count(*) FILTER (WHERE payload IS NULL)` sobre as
linhas de webhook criadas depois da etapa 1 = 0):

```ts
payload: { payload: body },
// `erros` volta a significar só erro — não escrever aqui.
```

E, aí sim:

```sql
UPDATE "BtgSyncLog" SET "erros" = NULL
WHERE tipo = 'webhook' AND "payload" IS NOT NULL;
```

A limpeza do `erros` é **opcional e adiável**. Enquanto ela não roda, o dado está
duplicado — que é chato, não perigoso.

**Viabilidade das duas etapas: sim, e é a forma recomendada.** Nada na etapa 1
depende da etapa 2, e a etapa 2 só depende de uma consulta que se responde em um
segundo.

---

## 5. O `as never` — o que acontece com ele

`erros: { payload: body } as never` tem `as never` porque `body` não casa com o
tipo `JsonValue` que o Prisma 7 espera (`body` é `unknown` vindo do
`request.json()`). O cast cala o compilador.

**Ele não sobrevive à etapa 2.** Na coluna nova, o caminho certo é tipar o que
entra em vez de calar o compilador:

```ts
import type { Prisma } from "@/generated/prisma";

const payload = body as Prisma.InputJsonValue;
// ...
payload,
```

`Prisma.InputJsonValue` é o tipo que a coluna aceita de fato. Continua sendo um
cast — a diferença é o que ele afirma: `as never` afirma "confie, não olhe";
`as Prisma.InputJsonValue` afirma "isto é JSON serializável", que é verdade e é
verificável (o `request.json()` acabou de provar).

Se o objetivo for zero cast, o passo seguinte é validar o corpo na borda (um
`zod` ou um type guard) e aí o tipo sai de graça. Isso é escopo próprio, não
deste plano.

---

## 6. Rollback

| etapa | como reverter | perde alguma coisa? |
|---|---|---|
| 1 (coluna + backfill + escrita dupla) | reverter o commit do writer; a coluna pode ficar | **não** — `erros` seguiu sendo escrita |
| 1, remoção total | `ALTER TABLE "BtgSyncLog" DROP COLUMN "payload";` | só o que a coluna nova tinha, que é cópia |
| 2 (parar de escrever em `erros`) | reverter o commit; volta a escrever nas duas | payloads das chamadas ocorridas entre a etapa 2 e o rollback **não** estarão em `erros` — e isso não importa, porque estão em `payload` |
| 2 + limpeza de `erros` | **irreversível pelo caminho normal** | nada, se a etapa 2 foi verificada; tudo, se não foi |

A única operação sem volta é o `UPDATE ... SET "erros" = NULL`, e ela é a única
que dá para adiar indefinidamente. **Recomendação: adiar.** 15 linhas de JSON
duplicado não pagam o risco de uma escrita irreversível.

Rede de segurança que já existe: `BackupExecucao` / `run-backup.ts` faz backup
diário para o B2 — e, desde a PR #353, o auditor de integrações confere de 30 em
30 minutos se a credencial daquele bucket ainda funciona. Antes disso, "tem
backup" era uma crença.

---

## 7. Outros casos de empréstimo de campo — o inventário

Levantamento feito nesta rodada. O `erros` **não** é caso isolado; é o menor deles.

### 7.1 `BtgSyncLog.tipo` — o modelo inteiro está emprestado (o maior caso)

O comentário lista 5 valores (`import`, `enrich`, `movements`, `webhook`,
`balances`). Os writers gravam **18**, e a maioria não tem nada com BTG:
`google-calendar-poll`, `outlook-poll`, `datacrazy-poll`,
`datacrazy-atividades-poll`, `alertas-clientes`, `integration-audit`,
`cadencia-backfill`, `recompute-agregados-reuniao`, `stvm-report`, `reconcile`…

`BtgSyncLog` **é** a tabela genérica de log de job deste sistema. O nome é que
não acompanhou. Consequência prática, idêntica à do incidente: quem escreve
`WHERE tipo IN (...)` a partir da lista do comentário perde dois terços das
linhas em silêncio.

Custo de renomear o modelo: alto (18 writers + leitores + a migration de rename).
Custo de corrigir o comentário e listar os 18: uma linha. **Recomendação: corrigir
o comentário agora, renomear nunca** — ou só junto de outra mudança que já toque
a tabela.

### 7.2 `BtgSyncLog.contasProcessadas` — mislabel que chega na tela (o mais urgente)

O nome diz "contas BTG processadas". O que os writers gravam:

| writer | o que é o número |
|---|---|
| `alertas-cliente.ts:455` | alertas **enviados** no Slack |
| `cron/integration-audit/route.ts` | **integrações** auditadas |
| `cron/google-calendar-poll/route.ts:81` | soma de upserts + removidas + contatos |
| `datacrazy-poll-runner.ts:242` | conversas com mudança |
| `cron/cadencia-backfill/route.ts:31` | clientes atualizados |

Só os writers de `btg-import`/`enrich`/`reconcile`/`api-sync` gravam contas de
verdade. E esta coluna é **lida e mostrada para humano** em
`/api/backoffice/btg-logs`, `/api/backoffice/sync-logs` e `/api/health` — ou seja,
está exatamente na posição em que o `erros` estava quando causou o incidente:
número certo, rótulo errado, na frente de quem decide.

**É o caso que eu levaria primeiro**, à frente do próprio `payload`. Custo baixo:
renomear para `itensProcessados` (ou documentar "o que este número conta depende
do `tipo`") não exige mover dado.

### 7.3 `BackupExecucao.destino` — sentinela em coluna de URI

O comentário diz que guarda `b2://bucket/caminho.sql.gz`. Em falha,
`run-backup.ts:33` e `cron/backup-restore-test/route.ts:146` gravam a string
`"FAILED"`; outros writers gravam `"b2://… (upload failed)"` e
`"b2://… → temp db …"`. A coluna é `String` NOT NULL sem default — a sentinela é
em parte forçada pelo schema. Lido direto na tela em `/api/admin/backups`, onde
"FAILED" aparece onde se espera um caminho. O sinal real de falha é `sucesso`,
igual ao caso do `erros`.

### 7.4 `EmpresaBootstrapLog.empresaId` — confirmado

`pessoa-grupo/backfill/route.ts:162` grava `empresaId: "pessoa-grupo"` — nome de
**operação**, não id de empresa. O próprio writer admite no docblock. Sem FK, então
o banco não impede. Já estava no backlog do `onix-co-estado.md` como "campo
`operacao` no `EmpresaBootstrapLog`". Adjacente: `.acao` e `.resultado` têm
comentários que listam menos valores do que os writers gravam — desatualização de
comentário, não empréstimo.

### 7.5 `ClienteBackoffice.fonteUltimoUpdate` — a forma não é a documentada

O comentário diz que registra "qual fonte escreveu por último cada campo" e lista
4 fontes. O writer (`upsert-cliente.ts:95`) grava `` `${fonte}:${timestamp}` `` —
string composta — e a policy declara **5** fontes (falta `api` na lista do
comentário). Consequência: `WHERE fonteUltimoUpdate->>'saldoConta' = 'base_btg'`
devolve **zero linhas**, sempre, e parece resposta.

Não é empréstimo de campo — é forma não documentada. Mas quebra query do mesmo
jeito, e é a coluna sobre a qual a medição do Saldo em CC (§ PR #353) está
construída.

### 7.6 Conferidos e limpos

`MovimentacaoBtg.payloadBruto`, `ReuniaoCliente.rawPayload`,
`ClienteBackoffice.breakdownProdutos`, `IngestaoEmail.status`, `ImportJob.status`,
`Implementacao.empresaId`, e os `metadata` de `EmpresaBootstrapLog`,
`SugestaoRiceLog` e `ContratoAcessoLog` — todos guardam o que o nome promete.

Também conferido e **descartado**: a suspeita de que
`integration-audit/route.ts` deixaria `ultimoErro` velho para sempre depois de uma
recuperação. Não deixa — `ResultadoAuditoria.mensagem` é explicitamente `null` em
sucesso (não `undefined`), então o `upsert` limpa a coluna.

---

## 8. Ordem recomendada

1. **`contasProcessadas`** (§7.2) — mislabel que já está na tela de quem decide.
2. **`BtgSyncLog.tipo`** (§7.1) — corrigir o comentário e listar os 18 valores.
3. **`payload`** (§3–§6) — etapa 1 quando houver espaço no teto de WIP.
4. **`erros = NULL`** (etapa 2) — só se e quando fizer falta. Provavelmente nunca.

O `payload` é o caso mais discutido e o terceiro mais urgente. Vale registrar
isso: o incidente aconteceu com o `erros`, então é nele que a atenção vai — mas o
`contasProcessadas` tem a mesma falha, chega na tela por três rotas e ainda não
mordeu ninguém.
