import assert from "node:assert/strict";
import { test } from "node:test";
import {
  normalizarChaveVocabulario,
  normalizarTipoParceiro,
  ehTipoParceiroConhecido,
  TIPOS_PARCEIRO,
} from "./vocabulario";

/**
 * O módulo encolheu quando `tipoProduto` virou FK para `Empresa`: a chave
 * estrangeira garante melhor do que a normalização garantia. Sobrou
 * `Parceiro.tipo`, que segue texto livre — e os testes seguem cuidando das
 * formas que um humano digita para a MESMA relação.
 */

// ── O colapso que faz o índice da #318 valer ─────────────────────────────

test("caixa diferente colapsa — o caso do índice parcial furado", () => {
  const formas = ["contabil", "Contabil", "CONTABIL", "CoNtAbIl"];
  const chaves = new Set(formas.map(normalizarTipoParceiro));
  assert.equal(chaves.size, 1);
  assert.equal([...chaves][0], "contabil");
});

test("acento colapsa", () => {
  assert.equal(normalizarTipoParceiro("contábil"), "contabil");
  assert.equal(normalizarTipoParceiro("sócio"), "socio");
});

test("espaço, underscore, hífen e ponto são o mesmo separador", () => {
  const formas = [
    "escritorio contabil",
    "escritorio_contabil",
    "escritorio-contabil",
    "escritorio.contabil",
    "escritorio  contabil",
    "Escritório Contábil",
  ];
  const chaves = new Set(formas.map(normalizarTipoParceiro));
  assert.equal(chaves.size, 1, `colapsou em ${[...chaves].join(" | ")}`);
  assert.equal([...chaves][0], "escritorio_contabil");
});

test("espaço nas pontas não vira separador na borda", () => {
  assert.equal(normalizarTipoParceiro("  contabil  "), "contabil");
  assert.equal(normalizarTipoParceiro("_contabil_"), "contabil");
  assert.equal(normalizarTipoParceiro("-contabil-"), "contabil");
});

// ── Entradas que não são texto útil ──────────────────────────────────────

test("vazio, só espaço e só separador viram null, não string vazia", () => {
  // String vazia gravada no banco passaria pelo índice como um valor legítimo
  // e criaria a categoria "" — pior que null, porque parece dado.
  assert.equal(normalizarTipoParceiro(""), null);
  assert.equal(normalizarTipoParceiro("   "), null);
  assert.equal(normalizarTipoParceiro("___"), null);
  assert.equal(normalizarTipoParceiro("--"), null);
});

test("null e undefined atravessam como null", () => {
  assert.equal(normalizarTipoParceiro(null), null);
  assert.equal(normalizarTipoParceiro(undefined), null);
});

test("não-string devolve null em vez de explodir", () => {
  // Entrada de formulário e payload de import chegam sem tipo garantido.
  assert.equal(normalizarChaveVocabulario(42 as unknown as string), null);
  assert.equal(normalizarChaveVocabulario({} as unknown as string), null);
});

// ── Lista de referência: avisa, não bloqueia ─────────────────────────────

test("todo tipo da lista se reconhece a si mesmo", () => {
  for (const t of TIPOS_PARCEIRO) assert.ok(ehTipoParceiroConhecido(t), t);
});

test("a lista é reconhecida mesmo digitada torta", () => {
  assert.ok(ehTipoParceiroConhecido("Contábil"));
  assert.ok(ehTipoParceiroConhecido("SÓCIO"));
  assert.ok(ehTipoParceiroConhecido(" Outro "));
});

test("relação fora da lista NORMALIZA mas não é 'conhecida'", () => {
  // O ponto do desenho: o desconhecido é gravável. Rejeitar aqui
  // reintroduziria o enum pela porta dos fundos.
  assert.equal(normalizarTipoParceiro("Ex-sócio"), "ex_socio");
  assert.equal(ehTipoParceiroConhecido("Ex-sócio"), false);
});

test("null nunca é 'conhecido'", () => {
  assert.equal(ehTipoParceiroConhecido(null), false);
  assert.equal(ehTipoParceiroConhecido(""), false);
  assert.equal(ehTipoParceiroConhecido(undefined), false);
});

// ── Invariantes da própria lista ─────────────────────────────────────────

test("a lista já está na forma canônica", () => {
  // Se alguém acrescentar "Ex Sócio" à lista, `ehTipoParceiroConhecido`
  // passaria a comparar a chave normalizada contra um item não-normalizado e
  // devolveria false para o próprio item da lista.
  for (const t of TIPOS_PARCEIRO) assert.equal(normalizarTipoParceiro(t), t);
});

test("a lista não tem duplicata após normalizar", () => {
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

test("a régua é a mesma da chave genérica", () => {
  // `normalizarTipoParceiro` é um apelido de `normalizarChaveVocabulario`. Se
  // um dia divergirem, um `groupBy` por tipo passa a agrupar diferente do
  // resto — e ninguém percebe até comparar relatórios.
  for (const bruto of ["Sócio", "CONTÁBIL", " outro_ "]) {
    assert.equal(normalizarTipoParceiro(bruto), normalizarChaveVocabulario(bruto), bruto);
  }
});
