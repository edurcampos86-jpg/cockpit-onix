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

const VAZIA: PossePessoa = { posse: {}, saldoInvestimentos: null };

/** Açúcar dos testes: lista de produtos da Corretora vira mapa de posse. */
const posseDe = (...ids: string[]): PossePessoa["posse"] => {
  const m: Record<string, number> = {};
  for (const id of ids) m[id] = (m[id] ?? 0) + 1;
  return m;
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
    posse: { ...posseDe("auto", "auto", "vida"), "conta-investimentos": 1 },
    saldoInvestimentos: 2_000_000,
  });
  const auto = r.possui.find((o) => o.id === "auto");
  assert.equal(auto?.quantidade, 2);
  assert.equal(r.possui.find((o) => o.id === "vida")?.quantidade, 1);
  assert.equal(r.possui.find((o) => o.id === "conta-investimentos")?.quantidade, 1);
});

test("o que ela não tem entra em lacunas", () => {
  const r = calcularOportunidades({ ...VAZIA, posse: posseDe("auto") });
  assert.equal(r.lacunas.some((o) => o.id === "residencial"), true);
  assert.equal(r.lacunas.some((o) => o.id === "auto"), false);
});

test("sem conta de investimentos, ela é lacuna e não some", () => {
  const r = calcularOportunidades(VAZIA);
  assert.equal(r.lacunas.some((o) => o.id === "conta-investimentos"), true);
});

test("possui e lacunas são disjuntos e cobrem tudo que é rastreado", () => {
  const r = calcularOportunidades({ ...VAZIA, posse: posseDe("vida") });
  const rastreadas = CATALOGO_DO_GRUPO.filter((o) => o.rastreada).length;
  assert.equal(r.possui.length + r.lacunas.length, rastreadas);
  const idsPossui = new Set(r.possui.map((o) => o.id));
  assert.equal(r.lacunas.some((o) => idsPossui.has(o.id)), false);
});

test("a ordem segue o catálogo, não o volume nem o alfabeto", () => {
  // Ordem que muda de ficha para ficha obriga a reler tudo toda vez.
  const r = calcularOportunidades(VAZIA);
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

test("rastrear uma empresa nova exige as DUAS coisas, e a posse é uma delas", () => {
  // Este teste existia e afirmava o defeito como correto: com o catálogo
  // virado para `rastreada: true`, o módulo dizia que a pessoa NÃO tem imóvel
  // — sem que ninguém tivesse como informar que ela tem. A posse era um campo
  // com nome de empresa (`produtosCorretora`), então a Imobiliária não cabia.
  //
  // Agora a posse é `ofertaId → quantidade`, e o mesmo catálogo produz as duas
  // respostas conforme o chamador informe ou não a posse. É essa a diferença
  // entre "não tem" e "não sabemos".
  const catalogo: OfertaDoGrupo[] = [
    { id: "imovel", nome: "Imóvel", empresaId: "imobiliaria", rastreada: true },
  ];

  const semInformar = calcularOportunidades(VAZIA, catalogo);
  assert.equal(semInformar.lacunas.length, 1, "sem posse informada, é lacuna");

  const informando = calcularOportunidades({ ...VAZIA, posse: { imovel: 2 } }, catalogo);
  assert.equal(informando.possui[0]?.quantidade, 2, "com posse informada, ela aparece");
  assert.equal(informando.lacunas.length, 0);
});

// ── O destaque: a frase que faz pegar o telefone ──────────────────────────

test("patrimônio investido sem seguro de vida vira a frase do produto", () => {
  // É o exemplo que originou esta aba.
  const r = calcularOportunidades({
    posse: { ...posseDe("auto"), "conta-investimentos": 1 },
    saldoInvestimentos: 2_000_000,
  });
  assert.ok(r.destaque?.includes("nenhum seguro de vida"), r.destaque ?? "sem destaque");
  assert.ok(r.destaque?.includes("2.000.000"), r.destaque ?? "");
});

test("com vida, o destaque desce para a próxima ausência de proteção", () => {
  const r = calcularOportunidades({
    posse: { ...posseDe("vida"), "conta-investimentos": 1 },
    saldoInvestimentos: 500_000,
  });
  assert.ok(r.destaque?.includes("plano de saúde"), r.destaque ?? "sem destaque");
});

test("com toda a proteção, não há destaque — silêncio é melhor que obviedade", () => {
  const r = calcularOportunidades({
    posse: { ...posseDe("vida", "saude", "dit"), "conta-investimentos": 1 },
    saldoInvestimentos: 1_000_000,
  });
  assert.equal(r.destaque, null);
});

test("sem saldo conhecido, a frase não inventa número", () => {
  // Saldo null é "não sei", e a régua deste repositório é não citar número que
  // o motor não devolve.
  const r = calcularOportunidades({
    posse: { "conta-investimentos": 1 },
    saldoInvestimentos: null,
  });
  assert.ok(r.destaque?.includes("conta de investimentos na Onix"), r.destaque ?? "");
  assert.equal(/\d/.test(r.destaque ?? ""), false, "nenhum dígito sem saldo conhecido");
});

test("saldo zero também não vira número na frase", () => {
  // Conta aberta e zerada não é patrimônio; dizer "R$ 0 investidos" seria
  // usar como argumento de venda um número que enfraquece o argumento.
  const r = calcularOportunidades({
    posse: { "conta-investimentos": 1 },
    saldoInvestimentos: 0,
  });
  assert.equal(/\d/.test(r.destaque ?? ""), false);
});

test("cliente só da Corretora tem o destaque inverso", () => {
  const r = calcularOportunidades({ ...VAZIA, posse: posseDe("auto") });
  assert.ok(r.destaque?.includes("não tem conta de investimentos"), r.destaque ?? "");
});

test("pessoa sem nada não tem destaque", () => {
  // Sem lado cheio da balança não há desequilíbrio a apontar — só uma lista de
  // produtos ainda não vendidos, que `lacunas` já mostra sem fingir insight.
  assert.equal(calcularOportunidades(VAZIA).destaque, null);
});

test("produto fora do catálogo é REPORTADO, não engolido", () => {
  // `catalogo-produtos.ts` registra quatro ids APOSENTADOS em ago/2026. Um
  // contrato antigo com um desses chega aqui, e antes produzia duas afirmações
  // erradas de uma vez: sumia de `possui` E as famílias que o substituíram
  // apareciam como lacuna, sem nada na tela dizendo que houve um contrato.
  const r = calcularOportunidades({ ...VAZIA, posse: { auto_residencial: 1 } });
  assert.equal(r.possui.length, 0);
  assert.equal(r.lacunas.some((o) => o.id === "auto_residencial"), false);
  assert.deepEqual(r.posseNaoReconhecida, [{ id: "auto_residencial", quantidade: 1 }]);
});

test("posse com quantidade zero ou negativa não vira possui", () => {
  const r = calcularOportunidades({ ...VAZIA, posse: { auto: 0, vida: -1 } });
  assert.equal(r.possui.length, 0);
  assert.equal(r.lacunas.some((o) => o.id === "auto"), true);
  assert.equal(r.posseNaoReconhecida.length, 0, "zero não é posse a reportar");
});

test("`rastreada` como STRING não vira afirmação", () => {
  // O catálogo pode chegar de JSON, e ali `"false"` é uma string truthy. Com a
  // negação simples (`!oferta.rastreada`), esta oferta viraria lacuna — o
  // único caminho conhecido de "não sabemos" virar "não tem".
  const catalogo = [
    { id: "imovel", nome: "Imóvel", empresaId: "imobiliaria", rastreada: "false" },
  ] as unknown as OfertaDoGrupo[];
  const r = calcularOportunidades(VAZIA, catalogo);
  assert.equal(r.naoRastreado.length, 1);
  assert.equal(r.lacunas.length, 0);
});

test("id repetido no catálogo não duplica a linha na tela", () => {
  const catalogo: OfertaDoGrupo[] = [
    { id: "auto", nome: "Auto", empresaId: "corretora", rastreada: true },
    { id: "auto", nome: "Auto (de novo)", empresaId: "imobiliaria", rastreada: true },
  ];
  const r = calcularOportunidades({ ...VAZIA, posse: { auto: 1 } }, catalogo);
  assert.equal(r.possui.length, 1, "a primeira declaração vence");
  assert.equal(r.possui[0].nome, "Auto");
});

test("saldo Infinity não vira 'R$ ∞' na frase", () => {
  const r = calcularOportunidades({
    posse: { "conta-investimentos": 1 },
    saldoInvestimentos: Number.POSITIVE_INFINITY,
  });
  assert.equal(r.destaque?.includes("∞"), false, r.destaque ?? "");
  assert.ok(r.destaque?.includes("conta de investimentos na Onix"), r.destaque ?? "");
});

test("toda frase do destaque é qualificada com 'pela Onix'", () => {
  // O módulo só enxerga contratos da Onix Corretora. Dizer "nenhum seguro de
  // vida", sem qualificar, afirma sobre o mercado inteiro — e o cliente que
  // tem apólice na concorrência derruba a conversa na primeira frase.
  for (const faltando of [[], ["vida"], ["vida", "saude"]]) {
    const r = calcularOportunidades({
      posse: { ...posseDe(...faltando), "conta-investimentos": 1 },
      saldoInvestimentos: 100_000,
    });
    if (r.destaque) assert.ok(r.destaque.includes("pela Onix"), r.destaque);
  }
});
