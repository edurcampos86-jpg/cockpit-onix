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

test("sem campos não cobertos, o aviso cita só o número que o motor devolve", () => {
  const t = avisoDeSobrescrita(2610);
  assert.ok(t.includes("2.610"));
  // Nenhum número além do único que o motor devolve. Continua sendo a regra do
  // arquivo: o texto não inventa contagem — mudou de onde ela vem, não se ela
  // pode ser inventada.
  assert.deepEqual(t.match(/\d[\d.]*/g), ["2.610"]);
});

test("com campos não cobertos, o aviso diz quantos e que eles ficam como estão", () => {
  const t = avisoDeSobrescrita(2610, [
    { campo: "fimVigencia", contratos: 37 },
    { campo: "comissao", contratos: 4 },
  ]);
  assert.ok(t.includes("37 fim de vigência"), "o campo aparece pelo nome de tela");
  assert.ok(t.includes("4 comissão"));
  assert.ok(t.includes("ficam como estão"), "precisa dizer que o valor é preservado");
  assert.ok(
    t.includes("mapeamento do perfil está incompleto"),
    "o aviso só é útil se apontar o que fazer",
  );
  // Os números são exatamente os três que o motor devolveu — nem um a mais.
  assert.deepEqual(t.match(/\d[\d.]*/g), ["2.610", "37", "4"]);
});

test("o aviso NUNCA lista campo com zero — zero que ninguém contou é invenção", () => {
  // O motor só devolve campo que tem contagem. Se a frase completasse a lista
  // dos cinco escrevendo "0" nos ausentes, estaria afirmando ter medido o que
  // não mediu — a mesma família de erro do número inventado.
  const t = avisoDeSobrescrita(10, [{ campo: "premio", contratos: 3 }]);
  // `\b0` e não `"0 "`: "10 contratos" tem um zero dentro, e a asserção
  // ingênua reprovaria o texto certo. O que não pode existir é um zero
  // ISOLADO, que só apareceria se a frase completasse a lista dos cinco.
  assert.equal(/\b0\s/.test(t), false, "nenhuma contagem zerada na lista");
  assert.equal(t.includes("comissão"), true, "a primeira frase cita os cinco campos por nome");
  assert.deepEqual(t.match(/\d[\d.]*/g), ["10", "3"]);
});

test("o aviso não promete mais que coluna ausente apaga — a trava mudou isso", () => {
  const t = avisoDeSobrescrita(10);
  assert.equal(
    t.includes("não diz quantos"),
    false,
    "o motor passou a ler os valores atuais; a ressalva antiga virou mentira",
  );
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

test("\"nada a fazer\" exige que NADA tenha sido recusado", () => {
  assert.equal(estadoVazioDoEnsaio({ ...VAZIO, linhasLidas: 312 })?.titulo, "Nada a fazer.");

  // Um único cliente novo já é trabalho: não é estado vazio.
  assert.equal(estadoVazioDoEnsaio({ ...VAZIO, linhasLidas: 312, pessoasACriar: 1 }), null);
  assert.equal(estadoVazioDoEnsaio({ ...VAZIO, linhasLidas: 312, contratosAAtualizar: 1 }), null);
});

test("tudo recusado NAO e 'nada a fazer' — e perfil quebrado", () => {
  // Os dois cenarios tem exatamente os mesmos contadores em zero e pedem acao
  // oposta: um manda fechar a tela, o outro manda consertar o perfil. Dizer
  // "todas cairam em contrato encerrado" aqui e dar a causa errada, e o
  // operador fecha a tela achando a base em dia com 312 linhas de fora.
  const v = estadoVazioDoEnsaio({ ...VAZIO, linhasLidas: 312, rejeitadas: 312 });
  assert.equal(v?.titulo, "Nenhuma linha aproveitada.");
  assert.ok(!/contrato ja encerrado|contrato já encerrado/.test(v?.corpo ?? ""));
});

test("recusa maior que o lido continua sendo 'nenhuma aproveitada'", () => {
  // Nao deveria acontecer; se acontecer, o texto degrada para o lado seguro —
  // nunca para "esta tudo em dia".
  const v = estadoVazioDoEnsaio({ ...VAZIO, linhasLidas: 10, rejeitadas: 12 });
  assert.equal(v?.titulo, "Nenhuma linha aproveitada.");
});

test("recusa parcial com o resto sem novidade nao e 'nada a fazer'", () => {
  const v = estadoVazioDoEnsaio({ ...VAZIO, linhasLidas: 312, rejeitadas: 40 });
  assert.equal(v?.titulo, "Nada seria gravado.");
  assert.ok(v?.corpo.includes("40"));
  assert.ok(v?.corpo.includes("312"));
  // Singular aqui também: o aviso de antiguidade, que já trata singular,
  // aparece na MESMA tela que este texto.
  const uma = estadoVazioDoEnsaio({ ...VAZIO, linhasLidas: 312, rejeitadas: 1 });
  assert.ok(uma?.corpo.startsWith("1 das 312 linhas foi recusada"));
});

test("os vazios não fecham a lista de causas em duas", () => {
  // Uma linha tem QUATRO sortes em `planejar`; repetida dentro do próprio
  // arquivo é a que faltava. Enumerar duas e omitir a terceira atribui causa
  // errada a um relatório todo de duplicatas.
  const nada = estadoVazioDoEnsaio({ ...VAZIO, linhasLidas: 312 });
  const parcial = estadoVazioDoEnsaio({ ...VAZIO, linhasLidas: 312, rejeitadas: 40 });
  for (const texto of [nada?.corpo ?? "", parcial?.corpo ?? ""]) {
    assert.match(texto, /repetida dentro do próprio arquivo/);
  }
});

test("recusa parcial COM algo a criar nao e estado vazio nenhum", () => {
  assert.equal(
    estadoVazioDoEnsaio({ ...VAZIO, linhasLidas: 312, rejeitadas: 40, contratosACriar: 5 }),
    null,
  );
});

test("nenhuma linha aproveitada é resposta, não falha — e sabe o singular", () => {
  const v = nenhumaLinhaAproveitada(312);
  assert.ok(v.corpo.includes("312"));
  assert.ok(!/erro|falha/i.test(v.titulo + v.corpo));
  // `avisoDeAntiguidade` já trata singular; "As 1 linhas" ao lado dela seria
  // incoerência entre dois textos que aparecem na mesma tela.
  assert.ok(nenhumaLinhaAproveitada(1).corpo.startsWith("A 1 linha foi lida"));
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
