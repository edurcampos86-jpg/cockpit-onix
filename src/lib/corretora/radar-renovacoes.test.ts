/**
 * Guardas do Radar de renovações — sem banco.
 *
 * O que se testa aqui é a parte que decide QUEM entra na fila: a contagem de
 * dias, a régua por produto e a leitura da régua guardada em `Config`. A
 * consulta é SQL e só se prova contra Postgres; a classificação, não — e é ela
 * que erra em silêncio, porque um contrato na faixa errada não quebra nada,
 * só deixa de ser ligado.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  REGUA_PADRAO,
  antecedenciaDe,
  diasAte,
  faixaDoContrato,
  lerRegua,
  produtosConfiguraveis,
  type ReguaAntecedencia,
} from "./radar-renovacoes.ts";
import { tiposProdutoValidos } from "./catalogo-produtos.ts";

/** Um dia qualquer, ao meio-dia UTC — como o motor grava datas de vigência. */
const HOJE = new Date(Date.UTC(2026, 7, 28, 12, 0, 0));
const dia = (n: number) => new Date(Date.UTC(2026, 7, 28 + n, 12, 0, 0));

// ── Contagem de dias ──────────────────────────────────────────────────────

test("diasAte conta por DIA, não por instante", () => {
  assert.equal(diasAte(dia(0), HOJE), 0);
  assert.equal(diasAte(dia(1), HOJE), 1);
  assert.equal(diasAte(dia(-1), HOJE), -1);
  assert.equal(diasAte(dia(30), HOJE), 30);
});

test("a hora do dia não muda a contagem", () => {
  // Se comparasse instantes, o mesmo contrato mudaria de faixa conforme a hora
  // em que alguém abrisse a tela — e a fila da manhã seria diferente da tarde.
  const fimDeManha = new Date(Date.UTC(2026, 7, 29, 3, 0, 0));
  const fimDeNoite = new Date(Date.UTC(2026, 7, 29, 23, 30, 0));
  const consultaTarde = new Date(Date.UTC(2026, 7, 28, 22, 0, 0));
  assert.equal(diasAte(fimDeManha, HOJE), 1);
  assert.equal(diasAte(fimDeNoite, HOJE), 1);
  assert.equal(diasAte(fimDeManha, consultaTarde), 1);
});

// ── A régua ───────────────────────────────────────────────────────────────

test("antecedenciaDe usa a regra do produto, e cai no padrão sem ela", () => {
  const regua: ReguaAntecedencia = { padrao: 30, porProduto: { vida: 60 } };
  assert.equal(antecedenciaDe("vida", regua), 60);
  assert.equal(antecedenciaDe("auto", regua), 30, "sem regra própria, vale o padrão");
});

test("todo produto do catálogo tem regra no padrão de fábrica", () => {
  // Não é exigência do código — `antecedenciaDe` cai no padrão sozinho. É
  // exigência de honestidade: se um produto novo entrar no catálogo e ninguém
  // pensar na antecedência dele, o teste obriga a decisão em vez de deixá-lo
  // herdar 30 dias por omissão.
  for (const id of tiposProdutoValidos()) {
    assert.equal(
      typeof REGUA_PADRAO.porProduto[id],
      "number",
      `produto "${id}" entrou no catálogo sem antecedência declarada`,
    );
  }
});

test("produtosConfiguraveis devolve exatamente o catálogo", () => {
  assert.deepEqual([...produtosConfiguraveis()].sort(), [...tiposProdutoValidos()].sort());
});

// ── As três faixas ────────────────────────────────────────────────────────

test("data no passado é ATRASADO, e a régua não muda isso", () => {
  // Perda que já aconteceu não é "vencendo com pressa". Nenhuma antecedência
  // configurada altera o fato de que a data passou.
  const frouxa: ReguaAntecedencia = { padrao: 0, porProduto: {} };
  const apertada: ReguaAntecedencia = { padrao: 365, porProduto: {} };
  assert.equal(faixaDoContrato(dia(-1), "auto", HOJE, frouxa), "atrasado");
  assert.equal(faixaDoContrato(dia(-200), "auto", HOJE, apertada), "atrasado");
});

test("vence HOJE é VENCENDO, não atrasado — ainda dá para ligar", () => {
  assert.equal(faixaDoContrato(dia(0), "auto", HOJE, REGUA_PADRAO), "vencendo");
});

test("a fronteira da antecedência inclui o último dia", () => {
  const regua: ReguaAntecedencia = { padrao: 30, porProduto: {} };
  assert.equal(faixaDoContrato(dia(30), "auto", HOJE, regua), "vencendo");
  assert.equal(faixaDoContrato(dia(31), "auto", HOJE, regua), "adiante");
});

test("produtos diferentes entram na fila em momentos diferentes", () => {
  // É a razão de a régua ser por produto: com 60 dias, o contrato de vida já
  // está na fila enquanto o de auto, com 30, ainda não.
  const emQuarentaDias = dia(40);
  assert.equal(faixaDoContrato(emQuarentaDias, "vida", HOJE, REGUA_PADRAO), "vencendo");
  assert.equal(faixaDoContrato(emQuarentaDias, "auto", HOJE, REGUA_PADRAO), "adiante");
});

test("sem data é SEM_DATA, nunca 'adiante'", () => {
  // Colapsar os dois esconderia o contrato: "adiante" é uma promessa de que
  // ele vai aparecer depois, e sem data ele nunca aparece.
  assert.equal(faixaDoContrato(null, "auto", HOJE, REGUA_PADRAO), "sem_data");
});

// ── A régua guardada em Config ────────────────────────────────────────────

test("sem valor configurado, vale o padrão de fábrica", () => {
  assert.deepEqual(lerRegua(undefined), REGUA_PADRAO);
  assert.deepEqual(lerRegua(null), REGUA_PADRAO);
  assert.deepEqual(lerRegua(""), REGUA_PADRAO);
});

test("JSON quebrado não derruba a fila — cai no padrão", () => {
  // Régua malformada não pode tirar do ar a tela que existe para impedir
  // perda de cliente.
  assert.deepEqual(lerRegua("{isso não é json"), REGUA_PADRAO);
  assert.deepEqual(lerRegua("[]"), REGUA_PADRAO, "array não é régua");
  assert.deepEqual(lerRegua("null"), REGUA_PADRAO);
  assert.deepEqual(lerRegua("42"), REGUA_PADRAO);
});

test("uma régua válida é lida inteira", () => {
  const r = lerRegua(JSON.stringify({ padrao: 45, porProduto: { auto: 15, vida: 90 } }));
  assert.equal(r.padrao, 45);
  assert.equal(r.porProduto.auto, 15);
  assert.equal(r.porProduto.vida, 90);
});

test("produto fora do catálogo é ignorado, não aceito", () => {
  // Régua para um id que nenhum contrato tem nunca entraria em vigor, e
  // ficaria na configuração parecendo que está valendo.
  const r = lerRegua(JSON.stringify({ padrao: 30, porProduto: { seguroDeDragao: 10, auto: 15 } }));
  assert.equal("seguroDeDragao" in r.porProduto, false);
  assert.equal(r.porProduto.auto, 15);
});

test("dia inválido é recusado — antecedência errada é pior que a padrão", () => {
  const r = lerRegua(
    JSON.stringify({
      padrao: -5,
      porProduto: { auto: -1, vida: 3.5, saude: "60", odonto: 99999, dit: 45 },
    }),
  );
  assert.equal(r.padrao, REGUA_PADRAO.padrao, "padrão negativo cai no de fábrica");
  assert.equal("auto" in r.porProduto, false, "negativo");
  assert.equal("vida" in r.porProduto, false, "fracionário");
  assert.equal("saude" in r.porProduto, false, "string");
  assert.equal("odonto" in r.porProduto, false, "acima do teto de 730");
  assert.equal(r.porProduto.dit, 45, "o válido do meio da lista sobrevive");
});

test("zero dia é válido — 'só me avise quando vencer' é uma escolha", () => {
  const r = lerRegua(JSON.stringify({ padrao: 0, porProduto: { auto: 0 } }));
  assert.equal(r.padrao, 0);
  assert.equal(r.porProduto.auto, 0);
  assert.equal(faixaDoContrato(dia(1), "auto", HOJE, r), "adiante");
  assert.equal(faixaDoContrato(dia(0), "auto", HOJE, r), "vencendo");
});

test("o teto de 730 dias existe para a fila não virar a base inteira", () => {
  const r = lerRegua(JSON.stringify({ padrao: 30, porProduto: { auto: 730 } }));
  assert.equal(r.porProduto.auto, 730, "dois anos cobre consórcio, o trâmite mais longo");
  const acima = lerRegua(JSON.stringify({ padrao: 30, porProduto: { auto: 731 } }));
  assert.equal("auto" in acima.porProduto, false);
});

test("poluição de protótipo pelo JSON de configuração é recusada", () => {
  // O valor vem de uma coluna de texto. `JSON.parse('{"__proto__":…}')`
  // atribuído a objeto literal envenena o protótipo. Mesma trava de
  // `importacao-ui/merge-dicionarios`.
  const r = lerRegua('{"padrao":30,"porProduto":{"__proto__":{"poluido":1},"auto":15}}');
  assert.equal(r.porProduto.auto, 15);
  assert.equal(({} as Record<string, unknown>).poluido, undefined);
  assert.equal(Object.prototype.hasOwnProperty.call(r.porProduto, "__proto__"), false);
});
