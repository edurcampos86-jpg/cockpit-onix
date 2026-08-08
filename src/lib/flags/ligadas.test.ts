import assert from "node:assert/strict";
import { test } from "node:test";
import { chavesLigadasDe } from "./ligadas";
import { compararComEsperado } from "./esperadas";

/* Este arquivo trava a divergência entre o que o SMOKE cobra
 * (`chavesLigadas()` → `/api/health`) e o que a TELA mostra. Os dois passaram a
 * derivar de `chavesLigadasDe`, então testar a função pura cobre os dois — sem
 * precisar de banco, que o CI não tem. */

const AMOSTRA = [
  { key: "HUB_ECOSSISTEMA", ligada: true },
  { key: "COCKPIT_REUNIAO", ligada: false },
  { key: "RBAC_ENFORCEMENT", ligada: true },
  { key: "LIMIAR_VACUO_DIAS", ligada: null }, // flag de VALOR
];

test("devolve só as ligadas", () => {
  assert.deepEqual(chavesLigadasDe(AMOSTRA), ["HUB_ECOSSISTEMA", "RBAC_ENFORCEMENT"]);
});

test("flag de VALOR (ligada: null) não entra — nem como ligada, nem como desligada", () => {
  // O bug que este arquivo existe para impedir: trocar `=== true` por truthy
  // não muda nada aqui, mas trocar por `!== false` faria LIMIAR_VACUO_DIAS
  // entrar na lista e o smoke acusar divergência que não existe.
  assert.ok(!chavesLigadasDe(AMOSTRA).includes("LIMIAR_VACUO_DIAS"));
  assert.equal(chavesLigadasDe([{ key: "X", ligada: null }]).length, 0);
});

test("sai ordenado — a comparação do smoke é textual", () => {
  const fora = [
    { key: "ZZZ", ligada: true },
    { key: "AAA", ligada: true },
    { key: "MMM", ligada: true },
  ];
  assert.deepEqual(chavesLigadasDe(fora), ["AAA", "MMM", "ZZZ"]);
});

test("a ordem da entrada não muda o resultado", () => {
  const a = chavesLigadasDe(AMOSTRA);
  const b = chavesLigadasDe([...AMOSTRA].reverse());
  assert.deepEqual(a, b);
});

test("lista vazia devolve vazia, não undefined", () => {
  assert.deepEqual(chavesLigadasDe([]), []);
});

test("não muta a entrada", () => {
  const entrada = [
    { key: "ZZZ", ligada: true },
    { key: "AAA", ligada: true },
  ];
  chavesLigadasDe(entrada);
  assert.deepEqual(
    entrada.map((f) => f.key),
    ["ZZZ", "AAA"],
    "o .sort() vazou para o array do chamador",
  );
});

test("o que o smoke cobra e o que a tela compara saem da MESMA lista", () => {
  // Simula os dois lados: o health publica `chavesLigadasDe(...)`, e a tela
  // alimenta `compararComEsperado` com `chavesLigadasDe(...)` do mesmo estado.
  // Com a lista esperada igual ao estado, não pode haver divergência.
  const ligadas = chavesLigadasDe(AMOSTRA);
  const comparacao = compararComEsperado(ligadas, ligadas.join(","));
  assert.equal(comparacao.diverge, false);
  assert.deepEqual(comparacao.sobrando, []);
  assert.deepEqual(comparacao.faltando, []);
});

test("estado que o smoke reprova é o mesmo que a tela acusa", () => {
  const ligadas = chavesLigadasDe(AMOSTRA);
  const comparacao = compararComEsperado(ligadas, "COCKPIT_REUNIAO");
  assert.equal(comparacao.diverge, true);
  assert.deepEqual(comparacao.faltando, ["COCKPIT_REUNIAO"]);
  assert.deepEqual(comparacao.sobrando, ["HUB_ECOSSISTEMA", "RBAC_ENFORCEMENT"]);
});
