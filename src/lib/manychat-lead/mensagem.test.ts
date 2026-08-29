import assert from "node:assert/strict";
import { test } from "node:test";
import {
  LIMITE_TEXTO,
  montarAvisoLead,
  normalizarUsername,
  parseLeadManyChat,
  temConteudo,
} from "./mensagem";

const COMPLETO = {
  nome: "Roberto Alves",
  username_instagram: "@robertoalves",
  palavra_gatilho: "BLINDAGEM",
  texto_mensagem: "quero saber sobre blindagem patrimonial",
  origem: "instagram",
};

test("payload completo vira o aviso no formato combinado", () => {
  assert.equal(
    montarAvisoLead(parseLeadManyChat(COMPLETO)),
    "🔔 Lead Instagram: Roberto Alves (@robertoalves) acionou BLINDAGEM: " +
      "quero saber sobre blindagem patrimonial\norigem: instagram",
  );
});

test("username chega com ou sem @ e sai com um @ só", () => {
  assert.equal(normalizarUsername("@edu"), "edu");
  assert.equal(normalizarUsername("edu"), "edu");
  assert.equal(normalizarUsername("@@edu"), "edu");
  assert.equal(normalizarUsername(""), "");
});

test("campo que o ManyChat não preencheu vira travessão, não 'undefined'", () => {
  // Variável não resolvida no painel chega como string vazia ou some do corpo.
  const aviso = montarAvisoLead(parseLeadManyChat({ nome: "Ana", origem: "" }));
  assert.equal(aviso, "🔔 Lead Instagram: Ana (@—) acionou —: —");
  assert.ok(!aviso.includes("undefined"));
});

test("sem origem o aviso fica em uma linha só", () => {
  const aviso = montarAvisoLead(parseLeadManyChat({ ...COMPLETO, origem: "" }));
  assert.ok(!aviso.includes("\n"));
});

test("DM longa é truncada e colapsa quebras de linha", () => {
  const lead = parseLeadManyChat({ ...COMPLETO, texto_mensagem: `a\n\nb${"c".repeat(500)}` });
  const aviso = montarAvisoLead(lead);
  const corpo = aviso.split("\n")[0];
  assert.ok(corpo.endsWith("…"), "trecho longo não foi truncado");
  assert.ok(!corpo.includes("  "), "quebras de linha viraram espaços duplos");
  assert.ok(corpo.length < LIMITE_TEXTO + 120);
});

test("texto exatamente no limite não ganha reticências", () => {
  const lead = parseLeadManyChat({ ...COMPLETO, texto_mensagem: "x".repeat(LIMITE_TEXTO) });
  assert.ok(montarAvisoLead(lead).includes("x".repeat(LIMITE_TEXTO)));
});

test("corpo que não é objeto não derruba o parse", () => {
  for (const bruto of [null, undefined, 42, "texto", [1, 2]]) {
    const lead = parseLeadManyChat(bruto);
    assert.equal(temConteudo(lead), false);
    assert.equal(lead.nome, "");
  }
});

test("só origem preenchida NÃO conta como conteúdo", () => {
  // É o corpo de um fluxo mal configurado: o literal fixo do painel chega, as
  // variáveis do lead não. Avisar aqui seria mandar "— (@—) acionou —: —".
  assert.equal(temConteudo(parseLeadManyChat({ origem: "instagram" })), false);
  assert.equal(temConteudo(parseLeadManyChat({ palavra_gatilho: "BLINDAGEM" })), true);
});

test("campo não-string do payload é ignorado em vez de virar '[object Object]'", () => {
  const lead = parseLeadManyChat({ nome: { first: "Ana" }, palavra_gatilho: 12 });
  assert.equal(lead.nome, "");
  assert.equal(lead.palavra_gatilho, "");
});
