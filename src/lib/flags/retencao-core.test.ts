import assert from "node:assert/strict";
import { test } from "node:test";
import {
  RETENCAO_MINIMA_DIAS,
  RETENCAO_PADRAO_DIAS,
  decidirRetencaoDias,
} from "./retencao-core";

test("sem config vale o default de 2 anos", () => {
  for (const bruto of [undefined, null, "", "   "]) {
    const r = decidirRetencaoDias(bruto);
    assert.equal(r.dias, RETENCAO_PADRAO_DIAS, `falhou em ${JSON.stringify(bruto)}`);
    assert.equal(r.pisoAplicado, false);
  }
});

test("string vazia NÃO vira zero dia", () => {
  // Number("") === 0. Sem o curto-circuito, "" apagaria o histórico inteiro
  // na primeira execução do cron.
  assert.equal(decidirRetencaoDias("").dias, RETENCAO_PADRAO_DIAS);
  assert.equal(decidirRetencaoDias(" ").dias, RETENCAO_PADRAO_DIAS);
});

test("valor abaixo do piso é IGNORADO e sinalizado", () => {
  // O erro que este piso existe para impedir: 7 no lugar de 700.
  for (const bruto of ["7", "1", "30", "364"]) {
    const r = decidirRetencaoDias(bruto);
    assert.equal(r.dias, RETENCAO_PADRAO_DIAS, `"${bruto}" deveria cair no default`);
    assert.equal(r.pisoAplicado, true, `"${bruto}" deveria sinalizar o piso`);
  }
});

test("exatamente o piso é aceito", () => {
  const r = decidirRetencaoDias(String(RETENCAO_MINIMA_DIAS));
  assert.equal(r.dias, RETENCAO_MINIMA_DIAS);
  assert.equal(r.pisoAplicado, false);
});

test("valor acima do piso vale — aumentar a retenção é livre", () => {
  for (const [bruto, esperado] of [["365", 365], ["730", 730], ["1095", 1095], ["36500", 36500]] as const) {
    const r = decidirRetencaoDias(bruto);
    assert.equal(r.dias, esperado);
    assert.equal(r.pisoAplicado, false);
  }
});

test("lixo, zero, negativo e infinito caem no default sem acusar piso", () => {
  // `pisoAplicado: false` aqui é proposital: não houve config válida a recusar,
  // então não há por que gritar no log a cada execução mensal.
  for (const bruto of ["0", "-1", "-9999", "abc", "730 dias", "NaN", "Infinity", "1e999"]) {
    const r = decidirRetencaoDias(bruto);
    assert.equal(r.dias, RETENCAO_PADRAO_DIAS, `"${bruto}" deveria cair no default`);
    assert.equal(r.pisoAplicado, false, `"${bruto}" não deveria sinalizar piso`);
  }
});

test("decimal é truncado, não arredondado para cima", () => {
  assert.equal(decidirRetencaoDias("730.9").dias, 730);
  assert.equal(decidirRetencaoDias("365.99").dias, 365);
});

test("espaço em volta não atrapalha", () => {
  assert.equal(decidirRetencaoDias("  1000  ").dias, 1000);
});

test("nunca devolve menos que o piso, para nenhuma entrada", () => {
  // Invariante do subsistema: não existe caminho que apague menos de um ano.
  const entradas = [undefined, null, "", " ", "0", "-5", "1", "364", "365", "730", "abc", "1e3"];
  for (const bruto of entradas) {
    assert.ok(
      decidirRetencaoDias(bruto).dias >= RETENCAO_MINIMA_DIAS,
      `${JSON.stringify(bruto)} produziu retenção abaixo do piso`,
    );
  }
});

test("o default é maior que o piso — senão o piso não protegeria nada", () => {
  assert.ok(RETENCAO_PADRAO_DIAS >= RETENCAO_MINIMA_DIAS);
});
