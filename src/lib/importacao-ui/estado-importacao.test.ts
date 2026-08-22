/**
 * O teste central é "ensaio velho não aplica": ele reproduz o caminho mais
 * natural de gravar coisa errada — ensaiar, ajustar, aplicar lendo os números
 * de antes.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ESTADO_INICIAL,
  assinaturaDoPlano,
  competenciaEhExcecao,
  competenciaValida,
  ensaioValeParaAgora,
  etapaAtual,
  impedimentosDoEnsaio,
  impressaoDoPerfil,
  podeAplicar,
  reduzir,
  type AcaoImportacao,
  type EstadoImportacao,
} from "./estado-importacao.ts";

const ARQUIVO = {
  nome: "producao-2026-07.xlsx",
  tamanhoBytes: 41_233,
  colunas: ["CPF/CNPJ", "Produto", "Apólice", "Situação", "Início", "Competência"],
};

const MAPA_COMPLETO = {
  "CPF/CNPJ": "cpfCnpj",
  Produto: "tipoProduto",
  Apólice: "numeroContrato",
  Situação: "status",
  Início: "inicioVigencia",
  Competência: "dataReferencia",
};

function rodar(acoes: AcaoImportacao[], inicial = ESTADO_INICIAL): EstadoImportacao {
  return acoes.reduce(reduzir, inicial);
}

const PRONTO = rodar([
  { tipo: "escolheu-arquivo", arquivo: ARQUIVO },
  {
    tipo: "escolheu-perfil",
    perfilId: "p1",
    mapeamento: MAPA_COMPLETO,
    impressaoDoPerfil: impressaoDoPerfil({ mapeamentoColunas: MAPA_COMPLETO }),
  },
]);

test("sem arquivo, sem mapeamento: a tela pede as duas coisas", () => {
  const p = impedimentosDoEnsaio(ESTADO_INICIAL);
  assert.ok(p.includes("Escolha o arquivo."));
  assert.equal(etapaAtual(ESTADO_INICIAL), "arquivo");
  assert.equal(podeAplicar(ESTADO_INICIAL), false);
});

test("mapeamento completo libera o ensaio, não o aplicar", () => {
  assert.deepEqual(impedimentosDoEnsaio(PRONTO), []);
  assert.equal(etapaAtual(PRONTO), "ensaio");
  assert.equal(podeAplicar(PRONTO), false);
});

test("depois do ensaio, aplicar liga", () => {
  const e = reduzir(PRONTO, { tipo: "ensaiou" });
  assert.equal(ensaioValeParaAgora(e), true);
  assert.equal(podeAplicar(e), true);
  assert.equal(etapaAtual(e), "aplicar");
});

test("mexer no mapeamento depois do ensaio desliga o aplicar", () => {
  const ensaiado = reduzir(PRONTO, { tipo: "ensaiou" });
  const mexido = reduzir(ensaiado, { tipo: "mapeou", rotulo: "Produto", campo: null });
  assert.equal(ensaioValeParaAgora(mexido), false);
  assert.equal(podeAplicar(mexido), false);
  // e a tela volta a pedir o que ficou faltando
  assert.ok(impedimentosDoEnsaio(mexido).some((p) => p.includes("tipoProduto")));
});

test("trocar a competência depois do ensaio também desliga", () => {
  const ensaiado = reduzir(PRONTO, { tipo: "ensaiou" });
  const trocado = reduzir(ensaiado, { tipo: "competencia-manual", valor: "2026-07" });
  assert.equal(podeAplicar(trocado), false);
});

test("mudar o parceiro padrão depois do ensaio desliga", () => {
  const ensaiado = reduzir(PRONTO, { tipo: "ensaiou" });
  const trocado = reduzir(ensaiado, { tipo: "definiu-parceiro-padrao", valor: "Porto Seguro" });
  assert.equal(podeAplicar(trocado), false);
});

test("reordenar o mesmo mapeamento NÃO invalida o ensaio", () => {
  const ensaiado = reduzir(PRONTO, { tipo: "ensaiou" });
  const igual = rodar(
    [
      { tipo: "mapeou", rotulo: "Situação", campo: null },
      { tipo: "mapeou", rotulo: "Situação", campo: "status" },
    ],
    ensaiado,
  );
  assert.equal(assinaturaDoPlano(igual), assinaturaDoPlano(ensaiado));
  // o ensaio foi zerado pela edição, mas a assinatura provou que o plano é o
  // mesmo — o custo é reensaiar, nunca aplicar plano diferente do conferido
  assert.equal(ensaioValeParaAgora(igual), false);
});

test("arquivo novo zera o mapeamento do anterior", () => {
  const outro = reduzir(PRONTO, {
    tipo: "escolheu-arquivo",
    arquivo: { ...ARQUIVO, nome: "producao-2026-08.xlsx", tamanhoBytes: 9 },
  });
  assert.deepEqual(outro.mapeamento, {});
  assert.equal(etapaAtual(outro), "mapeamento");
});

test("aplicar consome o ensaio: não dá para clicar duas vezes", () => {
  const depois = rodar(
    [{ tipo: "ensaiou" }, { tipo: "aplicando" }, { tipo: "aplicou" }],
    PRONTO,
  );
  assert.equal(depois.aplicando, false);
  assert.equal(podeAplicar(depois), false);
});

test("falha ao aplicar EXIGE novo ensaio — parte pode ter entrado", () => {
  // O gravar escreve em lotes e a rota devolve erro depois de parte já ter
  // entrado. Religar o botão com os números de antes ofereceria um segundo
  // clique em cima de base já mexida.
  const depois = rodar([{ tipo: "ensaiou" }, { tipo: "aplicando" }, { tipo: "falhou" }], PRONTO);
  assert.equal(depois.aplicando, false);
  assert.equal(podeAplicar(depois), false);
  assert.equal(etapaAtual(depois), "ensaio");
});

test("o perfil mudar no banco invalida o ensaio, mesmo com o id igual", () => {
  // Quem monta o plano é a rota, lendo mapeamento e dicionários do BANCO. Uma
  // assinatura que olhasse só o `perfilId` daria por válido um ensaio feito
  // com outro dicionário.
  const ensaiado = reduzir(PRONTO, { tipo: "ensaiou" });
  const perfilEditado = reduzir(ensaiado, {
    tipo: "escolheu-perfil",
    perfilId: "p1",
    mapeamento: MAPA_COMPLETO,
    impressaoDoPerfil: impressaoDoPerfil({
      mapeamentoColunas: MAPA_COMPLETO,
      dicionarios: { status: { ATIVO: "ativo" } },
    }),
  });
  assert.notEqual(assinaturaDoPlano(perfilEditado), assinaturaDoPlano(ensaiado));
  assert.equal(podeAplicar(perfilEditado), false);
});

test("impressaoDoPerfil não muda com a ordem das chaves", () => {
  const a = impressaoDoPerfil({
    mapeamentoColunas: { A: "cpfCnpj", B: "status" },
    dicionarios: { status: { X: "1", Y: "2" } },
  });
  const b = impressaoDoPerfil({
    dicionarios: { status: { Y: "2", X: "1" } },
    mapeamentoColunas: { B: "status", A: "cpfCnpj" },
  });
  assert.equal(a, b);
});

test("enquanto aplica, o botão não aceita outro clique", () => {
  const aplicando = rodar([{ tipo: "ensaiou" }, { tipo: "aplicando" }], PRONTO);
  assert.equal(podeAplicar(aplicando), false);
});

test("sem coluna de competência e sem valor à mão, o ensaio não roda", () => {
  const semReferencia = { ...PRONTO, mapeamento: semCompetencia(MAPA_COMPLETO) };
  assert.ok(
    impedimentosDoEnsaio(semReferencia).some((p) => p.includes("competência")),
    "a tela precisa exigir a competência de alguma fonte",
  );
});

test("competência à mão substitui a coluna, e fica marcada como exceção", () => {
  const manual = reduzir(
    { ...PRONTO, mapeamento: semCompetencia(MAPA_COMPLETO) },
    { tipo: "competencia-manual", valor: "2026-07" },
  );
  assert.deepEqual(impedimentosDoEnsaio(manual), []);
  assert.equal(competenciaEhExcecao(manual), true);
  assert.equal(competenciaEhExcecao(PRONTO), false);
});

test("competência à mão mal formatada barra o ensaio", () => {
  const manual = reduzir(PRONTO, { tipo: "competencia-manual", valor: "julho" });
  assert.ok(impedimentosDoEnsaio(manual).some((p) => p.includes("AAAA-MM")));
});

test("competenciaValida aceita o que a rota aceita, e só isso", () => {
  assert.equal(competenciaValida("2026-07"), true);
  assert.equal(competenciaValida("2026-07-31"), true);
  assert.equal(competenciaValida(" 2026-07 "), true);
  assert.equal(competenciaValida("2026-13"), false);
  assert.equal(competenciaValida("2026-00"), false);
  assert.equal(competenciaValida("07/2026"), false);
  assert.equal(competenciaValida(""), false);
});

test("duas colunas para o mesmo destino barram o ensaio antes do servidor", () => {
  const duplicado = reduzir(PRONTO, { tipo: "mapeou", rotulo: "Nome", campo: "cpfCnpj" });
  assert.ok(impedimentosDoEnsaio(duplicado).some((p) => p.includes("cpfCnpj")));
});

function semCompetencia(m: Record<string, string>): Record<string, string> {
  const copia = { ...m };
  delete copia["Competência"];
  return copia;
}
