/**
 * Guardas do cálculo de oportunidades do grupo.
 *
 * Tudo aqui é puro, então tudo é testável — e o que se testa é o que erra em
 * silêncio: uma lacuna que não devia existir manda o atendente oferecer o que
 * o cliente já tem, e uma que some deixa dinheiro na mesa sem ninguém saber.
 *
 * O caso mais caro tem teste próprio: afirmar "não possui" sobre uma empresa
 * do grupo que não tem fonte de dado. Ninguém verificou, e a ligação sai
 * errada.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CATALOGO_DO_GRUPO,
  calcularOportunidades,
  type OfertaDoGrupo,
  type PossePessoa,
} from "./oportunidades.ts";
import { CATALOGO_PRODUTOS, tiposProdutoValidos } from "@/lib/corretora/catalogo-produtos.ts";

const VAZIA: PossePessoa = {
  produtosCorretora: [],
  temContaInvestimentos: false,
  saldoInvestimentos: null,
};

// ── O catálogo do grupo ───────────────────────────────────────────────────

test("as onze ofertas da Corretora vêm do catálogo, não de uma cópia", () => {
  // Copiar criaria a segunda lista que ninguém lembra de atualizar. Se alguém
  // acrescentar produto ao catálogo da Corretora, ele aparece aqui sozinho —
  // e este teste é o que garante que continue assim.
  const daCorretora = CATALOGO_DO_GRUPO.filter((o) => o.empresaId === "corretora").map((o) => o.id);
  assert.deepEqual([...daCorretora].sort(), [...tiposProdutoValidos()].sort());
  assert.equal(daCorretora.length, CATALOGO_PRODUTOS.length);
});

test("nenhum id repetido no catálogo do grupo", () => {
  // Id repetido faria a mesma oferta aparecer em `possui` e em `lacunas`.
  const ids = CATALOGO_DO_GRUPO.map((o) => o.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("toda oferta declara uma empresa do grupo", () => {
  const empresas = new Set([
    "investimentos",
    "corretora",
    "planejamento",
    "imobiliaria",
    "educacao",
    "corporate",
    "tech",
  ]);
  for (const o of CATALOGO_DO_GRUPO) {
    assert.ok(empresas.has(o.empresaId), `oferta "${o.id}" aponta para empresa desconhecida`);
  }
});

// ── possui × não possui ───────────────────────────────────────────────────

test("o que a pessoa tem entra em possui, com a contagem", () => {
  // Duas apólices de auto são dois carros, e isso muda a conversa.
  const r = calcularOportunidades({
    produtosCorretora: ["auto", "auto", "vida"],
    temContaInvestimentos: true,
    saldoInvestimentos: 2_000_000,
  });
  const auto = r.possui.find((o) => o.id === "auto");
  assert.equal(auto?.quantidade, 2);
  assert.equal(r.possui.find((o) => o.id === "vida")?.quantidade, 1);
  assert.equal(r.possui.find((o) => o.id === "conta-investimentos")?.quantidade, 1);
});

test("o que ela não tem entra em lacunas", () => {
  const r = calcularOportunidades({ ...VAZIA, produtosCorretora: ["auto"] });
  assert.equal(r.lacunas.some((o) => o.id === "residencial"), true);
  assert.equal(r.lacunas.some((o) => o.id === "auto"), false);
});

test("sem conta de investimentos, ela é lacuna e não some", () => {
  const r = calcularOportunidades(VAZIA);
  assert.equal(r.lacunas.some((o) => o.id === "conta-investimentos"), true);
});

test("possui e lacunas são disjuntos e cobrem tudo que é rastreado", () => {
  const r = calcularOportunidades({ ...VAZIA, produtosCorretora: ["vida"] });
  const rastreadas = CATALOGO_DO_GRUPO.filter((o) => o.rastreada).length;
  assert.equal(r.possui.length + r.lacunas.length, rastreadas);
  const idsPossui = new Set(r.possui.map((o) => o.id));
  assert.equal(r.lacunas.some((o) => idsPossui.has(o.id)), false);
});

test("a ordem segue o catálogo, não o volume nem o alfabeto", () => {
  // Ordem que muda de ficha para ficha obriga a reler tudo toda vez.
  const r = calcularOportunidades({ ...VAZIA, produtosCorretora: [] });
  const esperada = CATALOGO_DO_GRUPO.filter((o) => o.rastreada).map((o) => o.id);
  assert.deepEqual(r.lacunas.map((o) => o.id), esperada);
});

// ── "não sabemos" nunca vira "não tem" ────────────────────────────────────

test("empresa sem fonte de dado NUNCA vira lacuna", () => {
  // É o caso mais caro do módulo: afirmar que a pessoa não tem imóvel pela
  // Onix Imob, quando ninguém tem como verificar, manda o atendente oferecer
  // o que o cliente talvez já tenha comprado.
  const r = calcularOportunidades(VAZIA);
  for (const id of ["imovel", "curso", "consultoria-corporate", "produto-tech", "plano-patrimonial"]) {
    assert.equal(r.lacunas.some((o) => o.id === id), false, `"${id}" não pode ser afirmado`);
    assert.equal(r.naoRastreado.some((o) => o.id === id), true, `"${id}" precisa aparecer à parte`);
    assert.equal(r.possui.some((o) => o.id === id), false);
  }
});

test("não rastreado tem quantidade zero e situação própria", () => {
  const r = calcularOportunidades(VAZIA);
  for (const o of r.naoRastreado) {
    assert.equal(o.situacao, "nao_rastreado");
    assert.equal(o.quantidade, 0);
  }
});

test("uma oferta migra de não rastreada para rastreada mudando uma linha", () => {
  // O caminho de saída precisa ser barato, senão a lista de não rastreadas
  // vira permanente. Com o catálogo injetado, a Imobiliária ganha rastreio
  // trocando `rastreada: false` por `true`.
  const catalogo: OfertaDoGrupo[] = [
    { id: "imovel", nome: "Imóvel", empresaId: "imobiliaria", rastreada: true },
  ];
  const r = calcularOportunidades(VAZIA, catalogo);
  assert.equal(r.naoRastreado.length, 0);
  assert.equal(r.lacunas.length, 1);
});

// ── O destaque: a frase que faz pegar o telefone ──────────────────────────

test("patrimônio investido sem seguro de vida vira a frase do produto", () => {
  // É o exemplo que originou esta aba.
  const r = calcularOportunidades({
    produtosCorretora: ["auto"],
    temContaInvestimentos: true,
    saldoInvestimentos: 2_000_000,
  });
  assert.ok(r.destaque?.includes("nenhum seguro de vida"), r.destaque ?? "sem destaque");
  assert.ok(r.destaque?.includes("2.000.000"), r.destaque ?? "");
});

test("com vida, o destaque desce para a próxima ausência de proteção", () => {
  const r = calcularOportunidades({
    produtosCorretora: ["vida"],
    temContaInvestimentos: true,
    saldoInvestimentos: 500_000,
  });
  assert.ok(r.destaque?.includes("plano de saúde"), r.destaque ?? "sem destaque");
});

test("com toda a proteção, não há destaque — silêncio é melhor que obviedade", () => {
  const r = calcularOportunidades({
    produtosCorretora: ["vida", "saude", "dit"],
    temContaInvestimentos: true,
    saldoInvestimentos: 1_000_000,
  });
  assert.equal(r.destaque, null);
});

test("sem saldo conhecido, a frase não inventa número", () => {
  // Saldo null é "não sei", e a régua deste repositório é não citar número que
  // o motor não devolve.
  const r = calcularOportunidades({
    produtosCorretora: [],
    temContaInvestimentos: true,
    saldoInvestimentos: null,
  });
  assert.ok(r.destaque?.includes("conta de investimentos na Onix"), r.destaque ?? "");
  assert.equal(/\d/.test(r.destaque ?? ""), false, "nenhum dígito sem saldo conhecido");
});

test("saldo zero também não vira número na frase", () => {
  // Conta aberta e zerada não é patrimônio; dizer "R$ 0 investidos" seria
  // usar como argumento de venda um número que enfraquece o argumento.
  const r = calcularOportunidades({
    produtosCorretora: [],
    temContaInvestimentos: true,
    saldoInvestimentos: 0,
  });
  assert.equal(/\d/.test(r.destaque ?? ""), false);
});

test("cliente só da Corretora tem o destaque inverso", () => {
  const r = calcularOportunidades({ ...VAZIA, produtosCorretora: ["auto"] });
  assert.ok(r.destaque?.includes("não tem conta de investimentos"), r.destaque ?? "");
});

test("pessoa sem nada não tem destaque", () => {
  // Sem lado cheio da balança não há desequilíbrio a apontar — só uma lista de
  // produtos ainda não vendidos, que `lacunas` já mostra sem fingir insight.
  assert.equal(calcularOportunidades(VAZIA).destaque, null);
});

test("produto fora do catálogo não cria oferta nem some com lacuna", () => {
  // Se um `tipoProduto` inválido chegar do banco, ele é ignorado — nunca vira
  // uma oferta fantasma na tela.
  const r = calcularOportunidades({ ...VAZIA, produtosCorretora: ["seguro-de-dragao"] });
  assert.equal(r.possui.length, 0);
  assert.equal(r.lacunas.some((o) => o.id === "seguro-de-dragao"), false);
  assert.equal(r.lacunas.length, CATALOGO_DO_GRUPO.filter((o) => o.rastreada).length);
});
