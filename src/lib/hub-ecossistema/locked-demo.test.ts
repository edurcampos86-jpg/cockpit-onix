import assert from "node:assert/strict";
import { test } from "node:test";
import { idsTravadosParaDemo } from "./locked-demo";
import { NOS_ECOSSISTEMA } from "./nos";

test("ausente ou vazio não trava nada — é o padrão", () => {
  for (const bruto of [undefined, null, "", "   ", ","]) {
    assert.equal(idsTravadosParaDemo(bruto).size, 0, `falhou em ${JSON.stringify(bruto)}`);
  }
});

test("trava os ids pedidos", () => {
  const r = idsTravadosParaDemo("corporate,agro");
  assert.deepEqual([...r].sort(), ["agro", "corporate"]);
});

test("espaço em volta e item vazio não atrapalham", () => {
  const r = idsTravadosParaDemo("  corporate , , agro ,");
  assert.deepEqual([...r].sort(), ["agro", "corporate"]);
});

test("id desconhecido é descartado, não quebra a tela", () => {
  // Uma chave de DEMONSTRAÇÃO derrubar o hub seria pior que ela não travar nada.
  const r = idsTravadosParaDemo("corporate,empresa-que-nao-existe,agro");
  assert.deepEqual([...r].sort(), ["agro", "corporate"]);
});

test("só id desconhecido resulta em nada travado", () => {
  assert.equal(idsTravadosParaDemo("xpto,foo").size, 0);
});

test("a comparação é sensível a caixa, como os ids do registro", () => {
  assert.equal(idsTravadosParaDemo("CORPORATE").size, 0);
  assert.equal(idsTravadosParaDemo("corporate").size, 1);
});

test("repetido não duplica", () => {
  assert.equal(idsTravadosParaDemo("agro,agro,agro").size, 1);
});

test("aceita travar todos os 8", () => {
  const todos = NOS_ECOSSISTEMA.map((n) => n.id).join(",");
  assert.equal(idsTravadosParaDemo(todos).size, NOS_ECOSSISTEMA.length);
});

test("todo id aceito existe mesmo em NOS_ECOSSISTEMA", () => {
  const conhecidos = new Set(NOS_ECOSSISTEMA.map((n) => n.id));
  for (const id of idsTravadosParaDemo("investimentos,corretora,tech,inventado")) {
    assert.ok(conhecidos.has(id), `id ${id} não existe no registro de nós`);
  }
});
