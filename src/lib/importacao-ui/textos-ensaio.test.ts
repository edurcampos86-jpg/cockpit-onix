/**
 * O teste que justifica este arquivo é o "campo que não existe": ele lê o
 * fonte de `ResultadoImportacao` e falha se a tela explicar um número que o
 * motor não devolve. Foi assim que um bloco inteiro de texto, com números
 * plausíveis e impossíveis, foi barrado antes de virar tela.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  ERROS,
  EXPLICACOES,
  avisoDeAntiguidade,
  avisoDeSobrescrita,
  estadoVazioDoEnsaio,
  nenhumaLinhaAproveitada,
  textoDaConfirmacao,
} from "./textos-ensaio.ts";

function camposDoResultado(): Set<string> {
  const fonte = readFileSync(
    join(process.cwd(), "src/lib/corretora/executar-importacao.ts"),
    "utf8",
  );
  const bloco = /export type ResultadoImportacao = \{([\s\S]*?)\n\};/.exec(fonte);
  assert.ok(bloco, "não achei ResultadoImportacao — o teste-guarda ficou cego");
  return new Set([...bloco[1].matchAll(/readonly (\w+)\??:/g)].map((m) => m[1]));
}

test("toda explicação corresponde a um campo que o motor devolve", () => {
  const reais = camposDoResultado();
  for (const campo of Object.keys(EXPLICACOES)) {
    assert.ok(reais.has(campo), `a tela explica "${campo}", que ResultadoImportacao não tem`);
  }
});

test("nenhum rótulo ou ajuda usa jargão de banco", () => {
  const proibidas = [/\bdry-run\b/i, /\bschema\b/i, /\bupsert\b/i, /\bnull\b/i, /\bpayload\b/i];
  for (const [campo, { rotulo, ajuda }] of Object.entries(EXPLICACOES)) {
    for (const p of proibidas) {
      assert.ok(!p.test(rotulo), `${campo}: jargão no rótulo`);
      assert.ok(!p.test(ajuda), `${campo}: jargão na ajuda (${p})`);
    }
    assert.ok(rotulo.length <= 60, `${campo}: rótulo longo demais para caber num cartão`);
  }
});

test("o rótulo de palavras não reconhecidas não promete cobrir todas", () => {
  // Cobre só as do dicionário do perfil: produto e situação fora do catálogo
  // são recusados antes, e saem em `rejeitadas[].motivo`. Sem "no perfil", o
  // rótulo promete uma lista completa que não é.
  assert.equal(EXPLICACOES.rotulosNaoMapeados.rotulo, "Palavras não reconhecidas no perfil");
});

test("o aviso de sobrescrita não inventa quantos valores somem", () => {
  const t = avisoDeSobrescrita(2610);
  assert.ok(t.includes("2.610"));
  assert.ok(
    t.includes("não diz quantos"),
    "o texto precisa admitir que o ensaio não lê os valores atuais",
  );
  // nenhum número além do único que o motor devolve
  assert.deepEqual(t.match(/\d[\d.]*/g), ["2.610"]);
});

test("o aviso de antiguidade diz que o que falta continua sendo criado", () => {
  const t = avisoDeAntiguidade(12);
  assert.ok(t.startsWith("12 linhas são"));
  assert.ok(t.includes("continuam sendo criados"));
  assert.ok(avisoDeAntiguidade(1).startsWith("1 linha é"), "singular");
});

const VAZIO = { linhasLidas: 0, contratosACriar: 0, contratosAAtualizar: 0, pessoasACriar: 0, rejeitadas: 0 };

test("zero linha lida é estado vazio de leitura, não de conteúdo", () => {
  assert.equal(estadoVazioDoEnsaio(VAZIO)?.titulo, "Nenhuma linha encontrada.");
});

test('"nada a fazer" só aparece quando não há nada a criar nem atualizar', () => {
  const nada = estadoVazioDoEnsaio({
    linhasLidas: 312,
    contratosACriar: 0,
    contratosAAtualizar: 0,
    pessoasACriar: 0,
  });
  assert.equal(nada?.titulo, "Nada a fazer.");

  // Um único cliente novo já é trabalho: não é estado vazio.
  const algo = estadoVazioDoEnsaio({
    linhasLidas: 312,
    contratosACriar: 0,
    contratosAAtualizar: 0,
    pessoasACriar: 1,
  });
  assert.equal(algo, null);

  assert.equal(
    estadoVazioDoEnsaio({
      linhasLidas: 312,
      contratosACriar: 0,
      contratosAAtualizar: 1,
      pessoasACriar: 0,
    }),
    null,
  );
});

test("nenhuma linha aproveitada é resposta, não falha", () => {
  const v = nenhumaLinhaAproveitada(312);
  assert.ok(v.corpo.includes("312"));
  assert.ok(!/erro|falha/i.test(v.titulo + v.corpo));
});

test("a confirmação soma o que vai gravar e não promete desfazer", () => {
  const c = textoDaConfirmacao({
    pessoasACriar: 412,
    contratosACriar: 1190,
    contratosAAtualizar: 2610,
    competencia: "2026-08",
  });
  assert.equal(c.titulo, "Gravar 3.800 contratos na base da Corretora?");
  assert.ok(c.linhas.some((l) => l.includes("412 clientes novos")));
  assert.ok(c.linhas.some((l) => l.includes("2026-08")), "a competência aparece na confirmação");
  const tudo = c.linhas.join(" ");
  assert.ok(!/desfazer|reverter/i.test(tudo), "não existe botão de desfazer — não prometa um");
  assert.ok(tudo.includes("não há como voltar atrás"));
});

test("os erros de perfil batem com os três casos que o servidor recusa", () => {
  assert.ok(ERROS.perfilDeOutraEmpresa("Imobiliária").includes("Imobiliária"));
  // NÃO pode mandar para tela de configuração de perfis: ela não existe em
  // `src/app/**`. Endereço inventado é da mesma família do número inventado.
  assert.ok(!/Configura(ç|c)ões/.test(ERROS.perfilInativo));
  assert.ok(ERROS.perfilInativo.includes("Escolha outro"));
  assert.ok(ERROS.arquivoGrande(20, 31).includes("20 MB"));
  assert.ok(ERROS.conexaoPerdida.includes("não será duplicado") === false);
  assert.ok(ERROS.conexaoPerdida.includes("nada será duplicado"));
});
