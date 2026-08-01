import assert from "node:assert/strict";
import { test } from "node:test";

import {
  compararTime,
  formatarDivergencia,
  temDivergencia,
  type PessoaComparavel,
} from "./recover-team-data-diff.ts";

// CPFs sintéticos, nunca de pessoa real.
const A: PessoaComparavel = {
  cpf: "52998224725",
  nomeCompleto: "Ana Exemplo",
  email: "ana@onixcapital.com.br",
};
const B: PessoaComparavel = {
  cpf: "11144477735",
  nomeCompleto: "Bruno Exemplo",
  email: "bruno@onixcapital.com.br",
};

test("time idêntico não acusa nada", () => {
  const d = compararTime([A, B], [A, B]);
  assert.deepEqual(d.faltandoNoArquivo, []);
  assert.deepEqual(d.faltandoNoBanco, []);
  assert.deepEqual(d.divergentes, []);
  assert.ok(!temDivergencia(d));
});

test("pessoa no banco e não no arquivo — o caso real dos 4 assessores", () => {
  // Humberto, Alan, Felipe Tachard e Laiane têm carteira ativa na Base BTG e
  // não estão em recover-team-data.ts. Numa restauração, não voltariam.
  const d = compararTime([A], [A, B]);
  assert.equal(d.faltandoNoArquivo.length, 1);
  assert.equal(d.faltandoNoArquivo[0].nomeCompleto, "Bruno Exemplo");
  assert.equal(d.faltandoNoBanco.length, 0);
  assert.ok(temDivergencia(d));
});

test("pessoa no arquivo e não no banco — seed obsoleto", () => {
  const d = compararTime([A, B], [A]);
  assert.equal(d.faltandoNoBanco.length, 1);
  assert.equal(d.faltandoNoBanco[0].nomeCompleto, "Bruno Exemplo");
  assert.ok(temDivergencia(d));
});

test("e-mail divergente é apontado com os dois lados", () => {
  const d = compararTime([A], [{ ...A, email: "ana.exemplo@onixcapital.com.br" }]);
  assert.equal(d.divergentes.length, 1);
  assert.equal(d.divergentes[0].campo, "email");
  assert.equal(d.divergentes[0].noArquivo, "ana@onixcapital.com.br");
  assert.equal(d.divergentes[0].noBanco, "ana.exemplo@onixcapital.com.br");
});

test("nome divergente é apontado", () => {
  const d = compararTime([A], [{ ...A, nomeCompleto: "Ana Exemplo da Silva" }]);
  assert.equal(d.divergentes.length, 1);
  assert.equal(d.divergentes[0].campo, "nomeCompleto");
});

test("caixa e espaço duplo no nome não são divergência", () => {
  const d = compararTime([A], [{ ...A, nomeCompleto: "  ANA   EXEMPLO " }]);
  assert.deepEqual(d.divergentes, []);
});

test("caixa no e-mail não é divergência", () => {
  const d = compararTime([A], [{ ...A, email: "ANA@OnixCapital.com.br" }]);
  assert.deepEqual(d.divergentes, []);
});

test("formatação do CPF não separa a mesma pessoa", () => {
  // O arquivo guarda "52998224725", alguém pode ter digitado pontuado no banco.
  const d = compararTime([A], [{ ...A, cpf: "529.982.247-25" }]);
  assert.ok(!temDivergencia(d), JSON.stringify(d));
});

test("CPF vazio é ignorado em vez de virar chave falsa", () => {
  // Sem isso, duas pessoas sem CPF colidiriam na chave "" e uma sumiria.
  const semCpf = { cpf: "", nomeCompleto: "Sem CPF", email: "x@onixcapital.com.br" };
  const d = compararTime([A, semCpf], [A, semCpf]);
  assert.ok(!temDivergencia(d));
});

test("relatório traz uma linha por problema", () => {
  const d = compararTime([A, B], [A, { ...B, email: "outro@onixcapital.com.br" }]);
  const linhas = formatarDivergencia(d);
  assert.equal(linhas.length, 1);
  assert.match(linhas[0], /DIVERGENTE/);
});

test("relatório de time em dia é vazio", () => {
  assert.deepEqual(formatarDivergencia(compararTime([A], [A])), []);
});
