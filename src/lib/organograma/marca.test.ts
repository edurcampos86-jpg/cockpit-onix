import { test } from "node:test";
import assert from "node:assert/strict";
import { marcaDoNome, marcaPlana } from "./marca";

test("as seis empresas do grupo saem exatamente como o desenho aprovado", () => {
  // Os nomes da esquerda são os que estão em `Empresa.nome`, em produção.
  const esperado: Record<string, string> = {
    "Onix Capital": "onixcapital",
    "Onix Corretora": "onixcorretora",
    "Onix Imob": "oniximob",
    "Onix Educação": "onixeducacao",
    "Onix Tech": "onixtech",
    "Onix Contábil": "onixcontabil",
  };
  for (const [doBanco, naTela] of Object.entries(esperado)) {
    assert.equal(marcaPlana(doBanco), naTela, `"${doBanco}" saiu diferente`);
  }
});

test("a holding separa onix de co — é o dourado do desenho", () => {
  assert.deepEqual(marcaDoNome("Onix Co"), { prefixo: "onix", sufixo: "co" });
});

test("acento sai sem tabela de tradução", () => {
  assert.equal(marcaPlana("Onix Educação"), "onixeducacao");
  assert.equal(marcaPlana("Onix Contábil"), "onixcontabil");
});

test("quem não é 'onix…' volta inteiro no prefixo, sem dourado", () => {
  // Um departamento não é marca: destacar metade dele seria inventar ênfase.
  assert.deepEqual(marcaDoNome("Planejamento Patrimonial"), {
    prefixo: "planejamentopatrimonial",
    sufixo: "",
  });
});

test("'Onix' sozinho não vira prefixo sem sufixo pendurado", () => {
  // Sem a checagem de comprimento, o corte devolveria sufixo vazio E prefixo
  // "onix" — igual ao caso acima por acidente. Aqui é de propósito.
  assert.deepEqual(marcaDoNome("Onix"), { prefixo: "onix", sufixo: "" });
});

test("nome vazio não quebra — devolve vazio, não undefined", () => {
  assert.deepEqual(marcaDoNome(""), { prefixo: "", sufixo: "" });
});

test("a regra é tipográfica: renomear no banco muda a tela junto", () => {
  // O ponto do módulo. Não há tabela a atualizar.
  assert.equal(marcaPlana("Onix Imobiliária"), "oniximobiliaria");
});
