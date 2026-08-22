import { test } from "node:test";
import assert from "node:assert/strict";
import { CATALOGO_EMPRESAS } from "@/lib/empresas/catalogo";
import {
  contarPorTipo,
  montarOrganograma,
  percorrer,
  profundidade,
  type NoDeclarado,
} from "./arvore";

/* ── A árvore REAL do grupo, direto do catálogo ────────────────────────── */

const REAL = montarOrganograma(CATALOGO_EMPRESAS);

test("o catálogo monta UMA raiz — a holding", () => {
  assert.equal(REAL.length, 1);
  assert.equal(REAL[0].id, "onix-co");
  assert.equal(REAL[0].tipo, "holding");
});

test("48 nós: 1 holding, 6 empresas, 41 departamentos", () => {
  assert.equal(percorrer(REAL).length, 48);
  assert.deepEqual(contarPorTipo(REAL), { holding: 1, empresa: 6, departamento: 41 });
});

test("30 transversais — as MESMAS 5 funções em cada uma das 6 empresas", () => {
  const t = percorrer(REAL).filter((n) => n.transversal);
  assert.equal(t.length, 30);
  const FUNCOES = ["ADM/Financeiro", "Backoffice", "Compliance", "Jurídico", "Qualidade e Pós-venda"];
  for (const empresa of REAL[0].filhos.filter((f) => f.tipo === "empresa")) {
    assert.deepEqual(
      empresa.filhos.filter((f) => f.transversal).map((f) => f.nome).sort(),
      FUNCOES,
      `${empresa.id} não tem as 5 transversais`,
    );
  }
});

test("4 consolidadores, todos na holding, e nenhum é transversal", () => {
  const c = percorrer(REAL).filter((n) => n.consolida);
  assert.equal(c.length, 4);
  assert.deepEqual(
    c.map((n) => n.nome).sort(),
    ["ADM/Financeiro", "Clientes do Grupo", "Compliance", "Jurídico"],
  );
  // Consolidar e ser transversal são papéis opostos: um SOMA, o outro FAZ.
  for (const n of c) {
    assert.equal(n.transversal, false, `${n.id} é transversal E consolida`);
    assert.ok(REAL[0].filhos.includes(n), `${n.id} não pendura na holding`);
  }
});

test("o mesmo rótulo em papéis diferentes — 7 Jurídicos, 1 consolidando", () => {
  const juridicos = percorrer(REAL).filter((n) => n.nome === "Jurídico");
  assert.equal(juridicos.length, 7);
  assert.equal(juridicos.filter((n) => n.consolida).length, 1);
  assert.equal(juridicos.filter((n) => n.transversal).length, 6);
});

test("a árvore tem 3 níveis — nem 2, nem 4", () => {
  assert.equal(profundidade(REAL), 3);
});

test("colisão de nome é INTENCIONAL, e o id desfaz", () => {
  const nos = percorrer(REAL);
  // "Onix Corretora" existe como empresa E como departamento dentro dela.
  const corretoras = nos.filter((n) => n.nome === "Onix Corretora");
  assert.equal(corretoras.length, 2);
  assert.deepEqual(
    corretoras.map((n) => [n.id, n.tipo]).sort(),
    [["corretora", "empresa"], ["corretora-corretora", "departamento"]],
  );
  // 20 nós, 20 ids distintos — mesmo com rótulo repetido.
  assert.equal(new Set(nos.map((n) => n.id)).size, 48);
});

test("departamento nunca tem filho; empresa pendura só na holding", () => {
  for (const no of percorrer(REAL)) {
    if (no.tipo === "departamento") assert.equal(no.filhos.length, 0, `${no.id} tem filho`);
  }
  for (const filho of REAL[0].filhos) {
    assert.ok(["empresa", "departamento"].includes(filho.tipo));
  }
  assert.deepEqual(
    REAL[0].filhos.filter((f) => f.tipo === "empresa").map((f) => f.id),
    ["investimentos", "educacao", "corretora", "imobiliaria", "contabil", "tech"],
  );
});

/* ── VITRINE: travar não é esconder ────────────────────────────────────── */

test("nó travado continua na árvore, e sem rota", () => {
  const arvore = montarOrganograma(CATALOGO_EMPRESAS, {
    travados: new Set(["corretora"]),
    rotas: new Map([["corretora", "/empresas/corretora"]]),
  });
  const corretora = percorrer(arvore).find((n) => n.id === "corretora")!;
  assert.equal(corretora.locked, true);
  assert.equal(corretora.rota, null, "link travado responderia 403");
  assert.equal(percorrer(arvore).length, 48, "travar não pode sumir com nó");
});

test("locked NÃO herda — empresa travada mostra departamento liberado", () => {
  const arvore = montarOrganograma(CATALOGO_EMPRESAS, { travados: new Set(["corretora"]) });
  const corretora = percorrer(arvore).find((n) => n.id === "corretora")!;
  assert.equal(corretora.locked, true);
  assert.equal(corretora.filhos.length, 8);
  for (const f of corretora.filhos) {
    assert.equal(f.locked, false, `${f.id} herdou trava que o RBAC não deu`);
  }
});

test("rota só aparece onde foi declarada", () => {
  const arvore = montarOrganograma(CATALOGO_EMPRESAS, {
    rotas: new Map([["investimentos", "/empresas/investimentos"]]),
  });
  const nos = percorrer(arvore);
  assert.equal(nos.find((n) => n.id === "investimentos")!.rota, "/empresas/investimentos");
  assert.equal(nos.find((n) => n.id === "tech")!.rota, null);
});

/* ── Dado torto: leitura tem de sobreviver ─────────────────────────────── */

const no = (id: string, parentId: string | null): NoDeclarado => ({
  id,
  nome: id,
  tipo: parentId === null ? "holding" : "departamento",
  parentId,
});

test("pai inexistente vira raiz, não some", () => {
  const arvore = montarOrganograma([no("raiz", null), no("orfao", "fantasma")]);
  assert.deepEqual(arvore.map((n) => n.id).sort(), ["orfao", "raiz"]);
  assert.equal(percorrer(arvore).length, 2);
});

test("ciclo não estoura a pilha nem perde nó", () => {
  const arvore = montarOrganograma([no("a", "b"), no("b", "a")]);
  assert.equal(percorrer(arvore).length, 2);
  assert.deepEqual(arvore.map((n) => n.id).sort(), ["a", "b"]);
});

test("nó que é pai de si mesmo vira raiz", () => {
  const arvore = montarOrganograma([no("eu", "eu")]);
  assert.deepEqual(arvore.map((n) => n.id), ["eu"]);
});

test("lista vazia devolve floresta vazia", () => {
  assert.deepEqual(montarOrganograma([]), []);
  assert.equal(profundidade([]), 0);
});
