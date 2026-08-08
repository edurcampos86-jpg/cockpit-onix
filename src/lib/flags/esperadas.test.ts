import assert from "node:assert/strict";
import { test } from "node:test";
import { compararComEsperado } from "./esperadas";

test("variável ausente ou vazia: sem expectativa, sem divergência", () => {
  // Inventar uma expectativa vazia acusaria como "sobrando" toda flag
  // legitimamente ligada — e o banner apareceria em todo ambiente.
  for (const bruto of [undefined, "", "   "]) {
    const r = compararComEsperado(["HUB_ECOSSISTEMA"], bruto);
    assert.equal(r.esperadas, null);
    assert.equal(r.diverge, false);
    assert.deepEqual(r.sobrando, []);
    assert.deepEqual(r.faltando, []);
  }
});

test("bate exatamente: não diverge", () => {
  const r = compararComEsperado(["COCKPIT_REUNIAO", "HUB_ECOSSISTEMA"], "HUB_ECOSSISTEMA,COCKPIT_REUNIAO");
  assert.equal(r.diverge, false);
  assert.deepEqual(r.esperadas, ["COCKPIT_REUNIAO", "HUB_ECOSSISTEMA"]);
});

test("normalização espelha a do workflow: ordem, espaço e vazio não contam", () => {
  // O workflow faz `tr ',' '\n' | tr -d '[:space:]' | grep -v '^$' | sort`.
  // Divergir daqui faria a tela dizer "confere" sobre lista que o smoke reprova.
  const r = compararComEsperado(
    ["COCKPIT_REUNIAO", "HUB_ECOSSISTEMA"],
    "  COCKPIT_REUNIAO , ,HUB_ECOSSISTEMA,  ",
  );
  assert.equal(r.diverge, false);
  assert.deepEqual(r.esperadas, ["COCKPIT_REUNIAO", "HUB_ECOSSISTEMA"]);
});

test("espaço NO MEIO do token também some, igual ao tr -d", () => {
  const r = compararComEsperado(["HUB_ECOSSISTEMA"], "HUB_ ECOSSISTEMA");
  assert.deepEqual(r.esperadas, ["HUB_ECOSSISTEMA"]);
  assert.equal(r.diverge, false);
});

test("'none' significa lista vazia, como no workflow", () => {
  const nada = compararComEsperado([], "none");
  assert.deepEqual(nada.esperadas, []);
  assert.equal(nada.diverge, false);

  const comFlag = compararComEsperado(["HUB_ECOSSISTEMA"], "none");
  assert.equal(comFlag.diverge, true);
  assert.deepEqual(comFlag.sobrando, ["HUB_ECOSSISTEMA"]);
});

test("'NONE' em qualquer caixa também é a sentinela", () => {
  assert.deepEqual(compararComEsperado([], "NONE").esperadas, []);
  assert.deepEqual(compararComEsperado([], " None ").esperadas, []);
});

test("'none' junto de outra flag é nome de flag, não sentinela", () => {
  // A sentinela só vale sozinha — igual ao workflow, que só cai em "none"
  // quando a lista normalizada fica vazia.
  const r = compararComEsperado([], "none,HUB_ECOSSISTEMA");
  assert.deepEqual(r.esperadas, ["HUB_ECOSSISTEMA", "none"]);
});

test("flag ligada fora da lista aparece em sobrando", () => {
  const r = compararComEsperado(["HUB_ECOSSISTEMA", "RBAC_ENFORCEMENT"], "HUB_ECOSSISTEMA");
  assert.equal(r.diverge, true);
  assert.deepEqual(r.sobrando, ["RBAC_ENFORCEMENT"]);
  assert.deepEqual(r.faltando, []);
});

test("flag esperada e desligada aparece em faltando", () => {
  const r = compararComEsperado([], "COCKPIT_REUNIAO,HUB_ECOSSISTEMA");
  assert.equal(r.diverge, true);
  assert.deepEqual(r.faltando, ["COCKPIT_REUNIAO", "HUB_ECOSSISTEMA"]);
  assert.deepEqual(r.sobrando, []);
});

test("as duas divergências ao mesmo tempo", () => {
  const r = compararComEsperado(["RBAC_ENFORCEMENT"], "HUB_ECOSSISTEMA");
  assert.deepEqual(r.faltando, ["HUB_ECOSSISTEMA"]);
  assert.deepEqual(r.sobrando, ["RBAC_ENFORCEMENT"]);
  assert.equal(r.diverge, true);
});

test("saídas vêm ordenadas — a tela não depende da ordem da variável", () => {
  const r = compararComEsperado(["ZZZ", "AAA"], "MMM,BBB");
  assert.deepEqual(r.sobrando, ["AAA", "ZZZ"]);
  assert.deepEqual(r.faltando, ["BBB", "MMM"]);
});
