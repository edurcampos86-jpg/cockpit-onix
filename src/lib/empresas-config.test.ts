import assert from "node:assert/strict";
import { test } from "node:test";
import {
  EMPRESAS_IMPLEMENTACOES,
  empresaAceitaImplementacao,
  nomeEmpresa,
  opcoesFiltroEmpresa,
} from "./empresas-config";

test("a fase inicial tem exatamente as 5 empresas alvo", () => {
  assert.deepEqual(
    EMPRESAS_IMPLEMENTACOES.map((e) => e.nome),
    ["Onix Capital", "Onix Corretora", "Onix Imob", "Onix Educação", "Onix Tech"],
  );
});

test("o id de Onix Capital continua sendo 'investimentos'", () => {
  // Só o rótulo mudou. Se o id mudar, toda Implementacao já gravada vira órfã.
  const capital = EMPRESAS_IMPLEMENTACOES.find((e) => e.nome === "Onix Capital");
  assert.equal(capital?.id, "investimentos");
  assert.equal(nomeEmpresa("investimentos"), "Onix Capital");
});

test("o id de Onix Imob continua sendo 'imobiliaria'", () => {
  assert.equal(nomeEmpresa("imobiliaria"), "Onix Imob");
});

test("empresa fora da fase inicial ainda resolve o nome", () => {
  assert.equal(nomeEmpresa("corporate"), "Onix Corporate");
  assert.equal(nomeEmpresa("planejamento"), "Planejamento Patrimonial");
});

test("id desconhecido cai no próprio id, nunca em vazio", () => {
  assert.equal(nomeEmpresa("empresa-que-nao-existe"), "empresa-que-nao-existe");
  assert.equal(nomeEmpresa(""), "");
});

test("só empresa da fase inicial aceita sugestão nova", () => {
  assert.equal(empresaAceitaImplementacao("educacao"), true);
  assert.equal(empresaAceitaImplementacao("investimentos"), true);
  assert.equal(empresaAceitaImplementacao("corporate"), false);
  assert.equal(empresaAceitaImplementacao("nao-existe"), false);
});

test("o filtro lista a fase inicial mesmo com o banco vazio", () => {
  assert.deepEqual(
    opcoesFiltroEmpresa([]).map((o) => o.id),
    ["investimentos", "corretora", "imobiliaria", "educacao", "tech"],
  );
});

test("empresaId gravado fora da fase entra no filtro, marcado", () => {
  const opcoes = opcoesFiltroEmpresa(["investimentos", "corporate"]);
  const extra = opcoes.find((o) => o.id === "corporate");
  assert.equal(extra?.nome, "Onix Corporate (fora da fase)");
});

test("id desconhecido no banco não some do filtro", () => {
  // Sem isto a linha aparece em "todas" e em nenhuma opção individual — o
  // filtro passa a mentir sobre o próprio conjunto.
  const opcoes = opcoesFiltroEmpresa(["lixo-antigo"]);
  assert.ok(opcoes.some((o) => o.id === "lixo-antigo"));
});

test("o filtro não duplica id repetido nem id já da fase", () => {
  const opcoes = opcoesFiltroEmpresa([
    "investimentos",
    "investimentos",
    "corporate",
    "corporate",
  ]);
  assert.equal(opcoes.length, new Set(opcoes.map((o) => o.id)).size);
  assert.equal(opcoes.filter((o) => o.id === "investimentos").length, 1);
});

test("os extras vêm depois da fase inicial, em ordem estável", () => {
  const ids = opcoesFiltroEmpresa(["planejamento", "corporate"]).map((o) => o.id);
  assert.deepEqual(ids.slice(-2), ["corporate", "planejamento"]);
});
