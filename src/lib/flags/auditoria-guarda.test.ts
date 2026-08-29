import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * Guarda de fonte: a gravação de flag pela tela precisa ser UPSERT.
 *
 * ── O QUE ESTA GUARDA PROTEGE ────────────────────────────────────────────
 * `Config` guarda o valor ATUAL de cada chave, e a linha só passa a existir
 * quando alguém grava. Flag que NUNCA foi ligada não tem linha nenhuma — foi
 * o estado de `CLIENTES_REGISTRO_RICO` e `SIDEBAR_FILTRADA` até agosto/2026.
 *
 * Se `gravarFlagComAuditoria` virar `update` puro, ligar essas flags pela tela
 * passa a estourar `P2025` (registro não encontrado) e a chave que nunca foi
 * ligada é justamente a única que não liga — o defeito aparece exatamente onde
 * ninguém testa, porque todo ambiente de desenvolvimento já tem as linhas.
 *
 * ── POR QUE GUARDA DE FONTE, E NÃO TESTE DE INTEGRAÇÃO ───────────────────
 * `auditoria.ts` importa `server-only` e o cliente Prisma; exercitá-lo de
 * verdade exigiria um Postgres no runner, que este repositório não sobe para
 * `npm test`. A regra que importa aqui — "cria se não existir" — é legível na
 * fonte, e é a mesma convenção de `guarda-drift-fts.sh` e
 * `guarda-not-null-sem-default.sh`: a regra mora onde dá para verificá-la, e
 * tem teste próprio para não parar de casar em silêncio.
 *
 * `updatedAt` NÃO é conferido aqui de propósito: a coluna é `@updatedAt`, que
 * o Prisma preenche no create e no update. Só o SQL cru precisa passá-la à mão
 * (a coluna é NOT NULL sem default) — e é por isso que o INSERT documentado em
 * `clientes-registro/flag.ts` falha com 23502 enquanto este caminho funciona.
 */
const FONTE = readFileSync(new URL("./auditoria.ts", import.meta.url), "utf8");

test("a gravação de flag usa upsert, não update", () => {
  assert.match(
    FONTE,
    /tx\.config\.upsert\(/,
    "gravarFlagComAuditoria precisa usar tx.config.upsert — flag nunca ligada não tem linha em Config",
  );
});

test("o upsert declara o ramo create com key e value", () => {
  assert.match(
    FONTE,
    /create:\s*\{\s*key,\s*value:\s*valor\s*\}/,
    "sem o ramo `create`, a primeira gravação de uma chave inexistente não cria a linha",
  );
});

test("não existe tx.config.update fora do upsert", () => {
  assert.ok(
    !/tx\.config\.update\(/.test(FONTE),
    "update puro em Config falha com P2025 quando a chave ainda não existe",
  );
});

test("a linha de auditoria entra na mesma transação da escrita", () => {
  const posUpsert = FONTE.indexOf("tx.config.upsert(");
  const posAudit = FONTE.indexOf("tx.configAudit.create(");
  assert.ok(posUpsert > 0 && posAudit > posUpsert, "configAudit.create deve vir depois do upsert");
  assert.match(
    FONTE,
    /prisma\.\$transaction\(async \(tx\)/,
    "as duas escritas precisam compartilhar a mesma transação",
  );
});
