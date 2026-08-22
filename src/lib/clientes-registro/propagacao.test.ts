import assert from "node:assert/strict";
import { test } from "node:test";

import { avancaUltimoContato, destinosDoContato } from "./propagacao.ts";

// ── A metade da regra que é fácil implementar errado: individual NÃO propaga,
// nem quando a conta pertence a um grupo. O teste existe porque "ele está no
// grupo, logo propaga" é a intuição natural e é o oposto do combinado.

test("contato individual devolve exatamente uma conta", () => {
  const d = destinosDoContato({ tipo: "individual", clienteId: "c1" });
  assert.deepEqual(d, [{ clienteId: "c1", origem: "proprio" }]);
});

test("contato no grupo propaga só para quem tem viaGrupo", () => {
  const d = destinosDoContato({
    tipo: "grupo",
    grupoId: "g1",
    membros: [
      { clienteId: "mae", viaGrupo: true },
      { clienteId: "filho", viaGrupo: false },
      { clienteId: "pai", viaGrupo: true },
    ],
  });
  assert.deepEqual(d, [
    { clienteId: "mae", origem: "grupo", grupoId: "g1" },
    { clienteId: "pai", origem: "grupo", grupoId: "g1" },
  ]);
});

test("grupo sem nenhum membro marcado não escreve em ninguém", () => {
  const d = destinosDoContato({
    tipo: "grupo",
    grupoId: "g1",
    membros: [{ clienteId: "a", viaGrupo: false }],
  });
  assert.deepEqual(d, []);
});

test("grupo vazio não quebra", () => {
  assert.deepEqual(destinosDoContato({ tipo: "grupo", grupoId: "g1", membros: [] }), []);
});

// A mesma conta duas vezes no grupo geraria duas linhas de histórico para um
// evento só — o índice @@unique impede no banco, isto impede antes.
test("conta repetida no grupo entra uma vez só", () => {
  const d = destinosDoContato({
    tipo: "grupo",
    grupoId: "g1",
    membros: [
      { clienteId: "a", viaGrupo: true },
      { clienteId: "a", viaGrupo: true },
    ],
  });
  assert.equal(d.length, 1);
});

// ── Regressão da data: o registro manual serve para lançar contato atrasado,
// e lançar atrasado não pode apagar contato recente.

test("ultimoContatoAt nunca regride", () => {
  const ontem = new Date("2026-08-21T10:00:00Z");
  const hoje = new Date("2026-08-22T10:00:00Z");
  assert.equal(avancaUltimoContato(ontem, hoje), true);
  assert.equal(avancaUltimoContato(hoje, ontem), false);
});

test("mesma data não conta como avanço", () => {
  const d = new Date("2026-08-22T10:00:00Z");
  assert.equal(avancaUltimoContato(d, new Date(d)), false);
});

test("cliente sem contato nenhum aceita qualquer data", () => {
  assert.equal(avancaUltimoContato(null, new Date("2020-01-01T00:00:00Z")), true);
  assert.equal(avancaUltimoContato(undefined, new Date("2020-01-01T00:00:00Z")), true);
});
