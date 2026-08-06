import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buscarSimilares,
  similaridade,
  textoSimilares,
  tokenizar,
  type LinhaEntregue,
} from "./similares";

function entregue(oQue: string, p: Partial<LinhaEntregue> = {}): LinhaEntregue {
  return {
    oQue,
    effort: null,
    prNumero: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    prMergedAt: new Date("2026-01-11T00:00:00Z"),
    ...p,
  };
}

test("tokenizar tira acento, caixa e stopword", () => {
  const t = tokenizar("Relatório DE receita para o assessor");
  assert.ok(t.has("relatorio"));
  assert.ok(t.has("receita"));
  assert.ok(t.has("assessor"));
  assert.equal(t.has("de"), false);
  assert.equal(t.has("para"), false);
  assert.equal(t.has("o"), false);
});

test("tokenizar descarta palavra de 1-2 letras", () => {
  const t = tokenizar("id do BI e KPI");
  assert.equal(t.has("id"), false);
  assert.equal(t.has("bi"), false);
  assert.ok(t.has("kpi"));
});

test("acentos diferentes viram o mesmo token", () => {
  assert.deepEqual([...tokenizar("receita")], [...tokenizar("recéita")]);
});

test("similaridade é 0 quando um dos lados é vazio", () => {
  assert.equal(similaridade(new Set(), new Set(["a"])), 0);
  assert.equal(similaridade(new Set(["a"]), new Set()), 0);
});

test("similaridade é 1 para conjuntos idênticos", () => {
  assert.equal(similaridade(new Set(["a", "b"]), new Set(["b", "a"])), 1);
});

test("Jaccard não premia texto longo (interseção sobre união)", () => {
  const curto = new Set(["receita"]);
  const longo = new Set(["receita", "x", "y", "z", "w", "v", "u", "t"]);
  // Se fosse contagem crua de palavras em comum, os dois dariam 1.
  assert.ok(similaridade(curto, longo) < 0.2);
});

test("encontra a ideia parecida e ignora a que não tem nada a ver", () => {
  const r = buscarSimilares("dashboard de receita por assessor", [
    entregue("dashboard de receita consolidada por assessor", { prNumero: 12 }),
    entregue("importar planilha de custódia do BTG"),
  ]);
  assert.equal(r.length, 1);
  assert.equal(r[0].prNumero, 12);
});

test("ruído abaixo do piso não entra no prompt", () => {
  // Enfiar ruído no prompt é pior que não mandar nada: a IA trata como evidência.
  const r = buscarSimilares("dashboard de receita por assessor", [
    entregue("corrigir cor do botão de exportar no relatório mensal do time"),
  ]);
  assert.deepEqual(r, []);
});

test("devolve no máximo o limite, do mais parecido para o menos", () => {
  const r = buscarSimilares(
    "dashboard receita assessor",
    [
      entregue("dashboard receita assessor mensal"),
      entregue("dashboard receita"),
      entregue("dashboard receita assessor"),
      entregue("relatorio receita assessor consolidado"),
    ],
    2,
  );
  assert.equal(r.length, 2);
  assert.equal(r[0].oQue, "dashboard receita assessor");
});

test("alvo sem token útil não busca nada", () => {
  assert.deepEqual(buscarSimilares("de a o", [entregue("qualquer coisa")]), []);
});

test("lead time é calculado em dias e vem no texto", () => {
  const r = buscarSimilares("dashboard de receita", [
    entregue("dashboard de receita", {
      prNumero: 5,
      effort: 2,
      createdAt: new Date("2026-01-01T00:00:00Z"),
      prMergedAt: new Date("2026-01-08T00:00:00Z"),
    }),
  ]);
  assert.equal(r[0].leadTimeDias, 7);
  const txt = textoSimilares(r);
  assert.match(txt, /effort estimado 2/);
  assert.match(txt, /entregue em 7 dias/);
  assert.match(txt, /PR #5/);
});

test("merge anterior à criação não vira lead time negativo", () => {
  const r = buscarSimilares("dashboard de receita", [
    entregue("dashboard de receita", {
      createdAt: new Date("2026-03-01T00:00:00Z"),
      prMergedAt: new Date("2026-02-01T00:00:00Z"),
    }),
  ]);
  assert.equal(r[0].leadTimeDias, null);
});

test("sem candidata o bloco é string vazia (nada entra no prompt)", () => {
  assert.equal(textoSimilares([]), "");
});
