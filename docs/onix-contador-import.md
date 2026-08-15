# Contador de import — desenho, **não implementado**

> Escrito na rodada do incidente do Saldo D0 (15/08). **Nada aqui foi executado.**
> É o desenho para o Eduardo aprovar antes de virar código.

---

## 1. O defeito de fundo

O import manual (`src/app/api/backoffice/clientes/route.ts`) **não grava linha de
log nenhuma**. É o único dos ~19 tipos de job do sistema que não grava: todos os
outros abrem um `BtgSyncLog` (`tipo` = `balances`, `datacrazy-poll`,
`integration-audit`, `outlook-poll`…). O import, que é o que o Eduardo roda com a
mão todo dia, é o único que passa em branco.

O rastro que existe hoje é `console.log` (`route.ts:895-905`) — vive no runtime do
Railway, expira, e ninguém abre. E a resposta HTTP traz `criados`/`atualizados`,
mas ela morre na tela assim que o navegador fecha.

Consequência exata, medida nesta rodada: **não existe artefato que responda "o
import de 30/07 escreveu quantas linhas?"**. Tentativa fracassada e ausência de
tentativa deixam o mesmo rastro: nenhum.

*É subir a ordem e não receber boleta. Sem recibo, "não executou" e "você não
mandou" são a mesma coisa — e ninguém descobre até conferir a posição.*

---

## 2. O que o contador precisa responder

Quatro números por execução, e o motivo de cada descarte:

| campo | pergunta que responde |
|---|---|
| `linhasLidas` | quantas linhas o arquivo trazia |
| `linhasEscritas` | quantas viraram `UPDATE` de fato no banco |
| `linhasDescartadas` | quantas não viraram nada |
| `motivos` | **por quê** — agregado, sem linha de cliente |

A conta tem de fechar: `lidas = escritas + descartadas + semMudanca`. Se não
fechar, o contador tem bug — e essa é a primeira coisa que o teste checa.

### Os motivos de descarte que o código já produz

Não são hipóteses; cada um existe hoje em uma linha específica:

| motivo | onde acontece | hoje é visível? |
|---|---|---|
| `sem_numero_conta` | `route.ts:863-871` | só `console.warn` |
| `orfao_sem_cliente` (update-only) | `route.ts:550-557` | só no JSON da resposta |
| `campo_bloqueado_pela_policy` | `upsert-cliente.ts:56-70` | agregado na resposta |
| `sem_mudanca` (`noop`) | `upsert-cliente.ts:76` | **em lugar nenhum** |
| `erro_no_upsert` | `route.ts:886-892` | só `console.warn` |
| `gate_de_sanidade` (rejeita tudo) | `import-sanity.ts:41-50` | 422 na tela |

O `noop` é o mais grave dos seis: hoje ele não aparece em canto nenhum. Um import
em que **todas** as 1.190 linhas dão `noop` devolve `200 OK` com
`atualizados: 0` — e "0" pode ser lido como "nada mudou, tudo em dia".

---

## 3. Onde gravar

**Uma linha em `BtgSyncLog` por execução**, no padrão que os outros 18 jobs já
usam. Sem tabela nova, sem migration.

```ts
// no início do POST, antes de qualquer escrita
const log = await prisma.btgSyncLog.create({
  data: { tipo: "import-planilha", trigger: "manual", userId: session.user.id },
});

// ao final, mesmo em erro (try/finally)
await prisma.btgSyncLog.update({
  where: { id: log.id },
  data: {
    finalizado: new Date(),
    sucesso: descartadas === 0,
    contasProcessadas: escritas,
    contasComErro: descartadas,
    resumo: `${fonte} · lidas:${lidas} escritas:${escritas} ` +
            `sem_mudanca:${semMudanca} descartadas:${descartadas} · ${motivosResumidos}`,
  },
});
```

`tipo` por fonte (`import-saldo-em-cc`, `import-base-btg`, `import-informacoes`)
em vez de um `import-planilha` genérico: assim a consulta "quando foi o último
Saldo D0?" é uma linha de SQL, não um `LIKE` no `resumo`.

### O que NÃO gravar

`erros`/`payload` com número de conta ou nome. Os motivos vão **agregados**
(`{"orfao_sem_cliente": 412, "sem_mudanca": 776}`), nunca linha a linha. Motivo:
a mesma razão que mantém `erros` fora do `/api/health` — este log é colado em
issue de incidente, e `conta` é identificador de cliente.

E **não** gravar em `erros`: essa coluna já está emprestada pelo webhook e tem
plano próprio (`docs/onix-plano-payload-webhook.md`). Motivo agregado cabe no
`resumo`, que é texto e é o campo certo.

---

## 4. Onde isso vira visível

Três lugares, em ordem de custo:

1. **`/api/backoffice/sync-logs`** — já lê `BtgSyncLog` e já tem tela. O import
   aparece lá **de graça** assim que gravar a linha. É o passo 1 e sozinho já
   resolve "o import de ontem rodou?".
2. **`/api/health`**, campo `imports` — no padrão de `integracoes`: última
   execução por fonte e `idadeMinutos`. Responde "o Saldo D0 está velho?" sem
   abrir tela nenhuma.
3. **Alarme** — Saldo D0 sem import há mais de 48 h vira aviso no Slack. Só
   depois de (1) e (2) existirem: alarme sobre número que ninguém conferiu é
   como o `com_erros`.

---

## 5. O teste que precisa vir junto

Parte pura, testável sem banco — uma função `contarImport(linhas, resultados)`
que devolve `{lidas, escritas, semMudanca, descartadas, motivos}`:

- a conta fecha (`lidas === escritas + semMudanca + descartadas`);
- `noop` conta como `semMudanca`, **nunca** como escrita;
- import 100% órfão devolve `escritas: 0` e `motivos.orfao_sem_cliente: N` — o
  caso que hoje devolve `200 OK` silencioso;
- `motivos` não carrega número de conta nem nome (o mesmo teste de chaves
  publicadas que `integracoes-auditadas.test.ts` já usa).

---

## 6. O que este contador teria evitado

Se ele existisse desde 30/07, a pergunta "o import parou ou está sendo
sobrescrito?" seria uma consulta de 5 segundos:

```sql
SELECT iniciado, "contasProcessadas", resumo
FROM "BtgSyncLog" WHERE tipo = 'import-saldo-em-cc'
ORDER BY iniciado DESC LIMIT 20;
```

Em vez disso custou uma rodada inteira de investigação, com o agravante de que
a evidência disponível — o carimbo `fonteUltimoUpdate` — **não distingue as duas
hipóteses**, porque guarda só o último escritor e o cron das 09:00 UTC reescreve
`saldoConta` todo dia.

Esse é o argumento inteiro para construir o contador: não é higiene, é o único
instrumento que responde a pergunta.
