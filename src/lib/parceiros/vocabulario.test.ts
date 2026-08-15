import assert from "node:assert/strict";
import { test } from "node:test";
import {
  normalizarChaveVocabulario,
  normalizarTipoProduto,
  normalizarTipoParceiro,
  ehTipoProdutoConhecido,
  ehTipoParceiroConhecido,
  TIPOS_PRODUTO,
  TIPOS_PARCEIRO,
} from "./vocabulario";

/**
 * O caso que motiva o módulo inteiro está no primeiro bloco: as formas que um
 * humano digita para o MESMO produto precisam colapsar num valor só, senão o
 * índice parcial único da #318 deixa passar dois acordos vigentes no mesmo
 * produto sem violar constraint nenhuma.
 */

// ── O colapso que faz o índice da #318 valer ─────────────────────────────

test("caixa diferente colapsa — o caso do índice parcial furado", () => {
  const formas = ["assessoria", "Assessoria", "ASSESSORIA", "AsSeSsOrIa"];
  const chaves = new Set(formas.map(normalizarTipoProduto));
  assert.equal(chaves.size, 1);
  assert.equal([...chaves][0], "assessoria");
});

test("acento colapsa", () => {
  assert.equal(normalizarTipoProduto("assessória"), "assessoria");
  assert.equal(normalizarTipoProduto("previdência"), "previdencia");
  assert.equal(normalizarTipoProduto("consórcio"), "consorcio");
});

test("espaço, underscore, hífen e ponto são o mesmo separador", () => {
  const formas = [
    "seguro resgatavel",
    "seguro_resgatavel",
    "seguro-resgatavel",
    "seguro.resgatavel",
    "seguro  resgatavel",
    "Seguro Resgatável",
  ];
  const chaves = new Set(formas.map(normalizarTipoProduto));
  assert.equal(chaves.size, 1, `colapsou em ${[...chaves].join(" | ")}`);
  assert.equal([...chaves][0], "seguro_resgatavel");
});

test("espaço nas pontas não vira separador na borda", () => {
  assert.equal(normalizarTipoProduto("  assessoria  "), "assessoria");
  assert.equal(normalizarTipoProduto("_assessoria_"), "assessoria");
  assert.equal(normalizarTipoProduto("-assessoria-"), "assessoria");
});

// ── Entradas que não são texto útil ──────────────────────────────────────

test("vazio, só espaço e só separador viram null, não string vazia", () => {
  // String vazia gravada no banco passaria pelo índice como um valor legítimo
  // e criaria a categoria "" — pior que null, porque parece dado.
  assert.equal(normalizarTipoProduto(""), null);
  assert.equal(normalizarTipoProduto("   "), null);
  assert.equal(normalizarTipoProduto("___"), null);
  assert.equal(normalizarTipoProduto("--"), null);
});

test("null e undefined atravessam como null", () => {
  assert.equal(normalizarTipoProduto(null), null);
  assert.equal(normalizarTipoProduto(undefined), null);
});

test("não-string devolve null em vez de explodir", () => {
  // Entrada de formulário e payload de import chegam sem tipo garantido.
  assert.equal(normalizarChaveVocabulario(42 as unknown as string), null);
  assert.equal(normalizarChaveVocabulario({} as unknown as string), null);
});

// ── Lista de referência: avisa, não bloqueia ─────────────────────────────

test("todo tipo da lista se reconhece a si mesmo", () => {
  for (const t of TIPOS_PRODUTO) assert.ok(ehTipoProdutoConhecido(t), t);
  for (const t of TIPOS_PARCEIRO) assert.ok(ehTipoParceiroConhecido(t), t);
});

test("a lista é reconhecida mesmo digitada torta", () => {
  assert.ok(ehTipoProdutoConhecido("Seguro Resgatável"));
  assert.ok(ehTipoProdutoConhecido("PREVIDÊNCIA"));
  assert.ok(ehTipoParceiroConhecido("Contábil"));
});

test("produto fora da lista NORMALIZA mas não é 'conhecido'", () => {
  // O ponto do desenho: o desconhecido é gravável. Rejeitar aqui
  // reintroduziria o enum pela porta dos fundos.
  assert.equal(normalizarTipoProduto("Câmbio"), "cambio");
  assert.equal(ehTipoProdutoConhecido("Câmbio"), false);
});

test("null nunca é 'conhecido'", () => {
  assert.equal(ehTipoProdutoConhecido(null), false);
  assert.equal(ehTipoProdutoConhecido(""), false);
  assert.equal(ehTipoParceiroConhecido(undefined), false);
});

// ── Invariantes da própria lista ─────────────────────────────────────────

test("as listas já estão na forma canônica", () => {
  // Se alguém acrescentar "Seguro Risco" à lista, `ehTipoProdutoConhecido`
  // passaria a comparar a chave normalizada contra um item não-normalizado e
  // devolveria false para o próprio item da lista.
  for (const t of TIPOS_PRODUTO) assert.equal(normalizarTipoProduto(t), t);
  for (const t of TIPOS_PARCEIRO) assert.equal(normalizarTipoParceiro(t), t);
});

test("as listas não têm duplicata após normalizar", () => {
  assert.equal(new Set(TIPOS_PRODUTO.map(normalizarTipoProduto)).size, TIPOS_PRODUTO.length);
  assert.equal(new Set(TIPOS_PARCEIRO.map(normalizarTipoParceiro)).size, TIPOS_PARCEIRO.length);
});

test("normalizar é idempotente", () => {
  // Roda no cadastro e pode rodar de novo num backfill; a segunda passada não
  // pode mudar nada.
  for (const bruto of ["Seguro Resgatável", "  contábil ", "cambio-futuro"]) {
    const uma = normalizarChaveVocabulario(bruto);
    assert.equal(normalizarChaveVocabulario(uma), uma, bruto);
  }
});

test("produto e parceiro usam a MESMA régua", () => {
  // Se as duas divergirem, um `groupBy` por tipo e um por tipoProduto passam a
  // agrupar com critérios diferentes — e ninguém percebe até comparar relatórios.
  for (const bruto of ["Sócio", "SEGURO RISCO", " outro_ "]) {
    assert.equal(normalizarTipoProduto(bruto), normalizarTipoParceiro(bruto), bruto);
  }
});
