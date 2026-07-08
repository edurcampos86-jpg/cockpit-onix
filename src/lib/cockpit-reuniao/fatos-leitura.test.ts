import assert from "node:assert/strict";
import { test } from "node:test";

import { agruparFatosLeitura, rotuloCampo, type FatoView } from "./fatos-leitura.ts";

function fato(p: Partial<FatoView> & Pick<FatoView, "categoria" | "campo" | "criadoEm">): FatoView {
  return {
    id: `${p.categoria}:${p.campo}:${p.criadoEm}`,
    valor: "v",
    valorAnterior: null,
    dados: null,
    fonte: "reuniao",
    sensivel: false,
    confirmado: false,
    vence: null,
    reuniaoId: null,
    ...p,
  };
}

test("agrupar — mais recente por campo vence (dedup por criadoEm)", () => {
  const g = agruparFatosLeitura([
    fato({ categoria: "PROJETO", campo: "projeto:onco3", valor: "velho", criadoEm: "2026-06-30T00:00:00.000Z" }),
    fato({ categoria: "PROJETO", campo: "projeto:onco3", valor: "novo", criadoEm: "2026-07-02T00:00:00.000Z" }),
  ]);
  assert.equal(g.length, 1);
  assert.equal(g[0].fatos.length, 1);
  assert.equal(g[0].fatos[0].valor, "novo");
});

test("agrupar — ordem canônica de categorias + label", () => {
  const g = agruparFatosLeitura([
    fato({ categoria: "SAUDE", campo: "saude:geral", criadoEm: "2026-07-01T00:00:00.000Z" }),
    fato({ categoria: "IDENTIDADE", campo: "idade", criadoEm: "2026-07-01T00:00:00.000Z" }),
    fato({ categoria: "PROJETO", campo: "projeto:onco3", criadoEm: "2026-07-01T00:00:00.000Z" }),
  ]);
  assert.deepEqual(g.map((x) => x.categoria), ["IDENTIDADE", "PROJETO", "SAUDE"]);
  assert.equal(g[0].label, "Identidade");
});

test("agrupar — categoria desconhecida vai para o fim", () => {
  const g = agruparFatosLeitura([
    fato({ categoria: "OUTRO", campo: "x", criadoEm: "2026-07-01T00:00:00.000Z" }),
    fato({ categoria: "FAMILIA", campo: "familia:gustavo", criadoEm: "2026-07-01T00:00:00.000Z" }),
  ]);
  assert.deepEqual(g.map((x) => x.categoria), ["FAMILIA", "OUTRO"]);
  assert.equal(g[1].label, "OUTRO"); // sem mapeamento → própria string
});

test("agrupar — campos homônimos em categorias diferentes não colidem", () => {
  const g = agruparFatosLeitura([
    fato({ categoria: "IDENTIDADE", campo: "x", criadoEm: "2026-07-01T00:00:00.000Z" }),
    fato({ categoria: "METRICA", campo: "x", criadoEm: "2026-07-01T00:00:00.000Z" }),
  ]);
  assert.equal(g.length, 2);
});

test("agrupar — fato sem valor é descartado", () => {
  const g = agruparFatosLeitura([
    fato({ categoria: "PROJETO", campo: "projeto:vazio", valor: "", criadoEm: "2026-07-01T00:00:00.000Z" }),
    fato({ categoria: "PROJETO", campo: "projeto:nulo", valor: null, criadoEm: "2026-07-01T00:00:00.000Z" }),
    fato({ categoria: "PROJETO", campo: "projeto:ok", valor: "tem", criadoEm: "2026-07-01T00:00:00.000Z" }),
  ]);
  assert.equal(g.length, 1);
  assert.equal(g[0].fatos.length, 1);
  assert.equal(g[0].fatos[0].campo, "projeto:ok");
});

test("rotuloCampo — tira prefixo-tipo e humaniza", () => {
  assert.equal(rotuloCampo("familia:gustavo"), "Gustavo");
  assert.equal(rotuloCampo("memoravel:seguro-vida"), "Seguro vida");
  assert.equal(rotuloCampo("idade"), "Idade");
});
