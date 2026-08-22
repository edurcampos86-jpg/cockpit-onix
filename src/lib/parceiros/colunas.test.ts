import assert from "node:assert/strict";
import { test } from "node:test";
import {
  COLUNAS_PARCEIROS,
  colunasVisiveis,
  totalColunasVisiveis,
} from "./colunas";

test("a coluna de comissão EXISTE, e nasce invisível", () => {
  const comissao = COLUNAS_PARCEIROS.find((c) => c.chave === "comissao");
  assert.ok(comissao, "a coluna sumiu — o espaço reservado foi perdido");
  assert.equal(comissao.visivel, false);
});

test("coluna invisível reserva largura — é o ponto do desenho", () => {
  // Sem largura declarada, ligar a coluna depois empurraria todas as outras.
  for (const c of COLUNAS_PARCEIROS.filter((x) => !x.visivel)) {
    assert.notEqual(c.largura, "auto", `${c.chave} sem largura reservada`);
    assert.ok(c.largura.length > 0, `${c.chave} sem largura`);
  }
});

test("toda coluna oculta explica POR QUE está oculta", () => {
  // Coluna escondida sem motivo escrito vira mistério em três meses.
  for (const c of COLUNAS_PARCEIROS.filter((x) => !x.visivel)) {
    assert.ok(c.motivoOculta && c.motivoOculta.length > 20, c.chave);
  }
});

test("chaves não se repetem", () => {
  const chaves = COLUNAS_PARCEIROS.map((c) => c.chave);
  assert.equal(new Set(chaves).size, chaves.length);
});

test("colunasVisiveis não devolve a comissão, e o total bate", () => {
  const visiveis = colunasVisiveis();
  assert.ok(!visiveis.some((c) => c.chave === "comissao"));
  assert.equal(totalColunasVisiveis(), visiveis.length);
  assert.equal(visiveis.length, COLUNAS_PARCEIROS.length - 1);
});

test("colunas numéricas alinham à direita", () => {
  for (const chave of ["clientes", "acordos", "comissao"]) {
    const c = COLUNAS_PARCEIROS.find((x) => x.chave === chave);
    assert.equal(c?.alinhamento, "direita", chave);
  }
});
