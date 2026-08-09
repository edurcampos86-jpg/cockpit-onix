import assert from "node:assert/strict";
import { test } from "node:test";
import { flagLigada } from "./registro";

/* ──────────────────────────────────────────────────────────────
 * Teste DIFERENCIAL da centralização dos parsers de flag.
 *
 * A troca dos 15 pontos de uso por `flagLigada` é uma refatoração que precisa
 * ser PROVADAMENTE sem mudança de comportamento — um dos pontos é o gate de
 * escrita de `ClienteFato`, que é ledger APPEND-ONLY: uma flag que passasse a
 * ler como ligada gravaria fatos que não dá para apagar depois.
 *
 * Não havia (e não há) suíte cobrindo aquele caminho. Então em vez de confiar
 * em "o build passou", este arquivo reimplementa VERBATIM as duas expressões
 * que existiam no código e compara com a função nova sobre um conjunto
 * exaustivo de entradas. Se alguém colapsar os dialetos no futuro, este teste
 * falha e mostra exatamente onde o comportamento mudaria.
 *
 * As duas réplicas abaixo NÃO devem ser "melhoradas": elas existem para serem
 * o retrato do código antigo.
 * ────────────────────────────────────────────────────────────── */

/** Réplica de `parseBoolFlag`, copiado em 10 módulos `lib/<modulo>/flag.ts`
 *  e de `parseBool` na rota de backfill. */
function antigoAmplo(v: string | undefined): boolean {
  if (!v) return false;
  return ["1", "true", "on", "yes", "sim"].includes(v.trim().toLowerCase());
}

/** Réplica das 4 comparações inline (instrumentation.ts e
 *  actions/reuniao-estruturada.ts): `const f = valor?.trim().toLowerCase()`
 *  seguido de `f === "on" || f === "true" || f === "1"`. */
function antigoEstrito(v: string | undefined): boolean {
  const f = v?.trim().toLowerCase();
  return f === "on" || f === "true" || f === "1";
}

/** Entradas: os aceitos dos dois dialetos, variações de caixa e espaço, e lixo. */
const ENTRADAS: (string | undefined)[] = [
  undefined,
  "",
  " ",
  "\t\n",
  "1",
  "0",
  "true",
  "false",
  "on",
  "off",
  "yes",
  "no",
  "sim",
  "nao",
  "não",
  "TRUE",
  "On",
  "SIM",
  "Yes",
  "  1  ",
  " true ",
  "\tsim\n",
  "  ON  ",
  "2",
  "-1",
  "null",
  "undefined",
  "enabled",
  "habilitado",
  "1 ",
  " 1",
  "true1",
  "1true",
  "s",
  "y",
];

test("dialeto amplo: flagLigada é idêntica ao parseBoolFlag antigo", () => {
  for (const entrada of ENTRADAS) {
    assert.equal(
      flagLigada(entrada, "amplo"),
      antigoAmplo(entrada),
      `divergiu em ${JSON.stringify(entrada)}`,
    );
  }
});

test("dialeto estrito: flagLigada é idêntica às comparações inline antigas", () => {
  // Este é o que protege o gate de ClienteFato (PERFIL_FATO_WRITE /
  // PERFIL_FATO_RICO_WRITE) e os schedulers in-process.
  for (const entrada of ENTRADAS) {
    assert.equal(
      flagLigada(entrada, "estrito"),
      antigoEstrito(entrada),
      `divergiu em ${JSON.stringify(entrada)}`,
    );
  }
});

test("o default de flagLigada é o amplo — quem omitir não vira estrito sem querer", () => {
  for (const entrada of ENTRADAS) {
    assert.equal(flagLigada(entrada), antigoAmplo(entrada));
  }
});

test("os dialetos AINDA divergem em yes/sim — a unificação foi de código, não de semântica", () => {
  // Se este teste passar a falhar, alguém colapsou os dialetos de verdade. Isso
  // LIGA PERFIL_FATO_WRITE em qualquer ambiente onde o valor gravado seja
  // "sim"/"yes", e o ledger de fatos não tem desfazer. A mudança pode ser
  // desejável, mas precisa ser uma decisão explícita, não efeito colateral.
  for (const entrada of ["yes", "sim", "SIM", " Yes "]) {
    assert.equal(flagLigada(entrada, "amplo"), true);
    assert.equal(flagLigada(entrada, "estrito"), false);
  }
});
