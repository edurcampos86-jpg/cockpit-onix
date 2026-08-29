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
  contarSemContato,
  diaCivil,
  diasAte,
  escolherContraparte,
  faixaDoContrato,
  lerRegua,
  produtosConfiguraveis,
  type Contraparte,
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

// ── Para quem se liga: a precedência do contato ───────────────────────────
//
// A primeira versão deste código escondia a precedência num
// `ORDER BY (b."pessoaGrupoId" = pg.id) DESC` dentro do SQL, e ela saía
// INVERTIDA: sem vínculo a expressão é NULL, e `DESC` no Postgres é
// `NULLS FIRST`, então o `LIMIT 1` colhia a inferência por documento e
// descartava a decisão registrada. A fila entregava o telefone da pessoa
// errada — num campo que existe para ser discado.
//
// A regra saiu do `ORDER BY` e virou função pura por causa disso.

const VINCULADO: Contraparte = {
  id: "cb_vinculo",
  pessoaGrupoId: "pg_1",
  documento: "00000000000",
  nome: "Vínculo Registrado",
  telefone: "71-90000-0001",
};
const POR_DOCUMENTO: Contraparte = {
  id: "cb_doc",
  pessoaGrupoId: null,
  documento: "09714600510",
  nome: "Inferido Por Documento",
  telefone: "71-90000-0002",
};

test("o vínculo ganha do casamento por documento", () => {
  // Vínculo é decisão registrada; documento é inferência.
  const escolhido = escolherContraparte("pg_1", "09714600510", [POR_DOCUMENTO, VINCULADO]);
  assert.equal(escolhido?.nome, "Vínculo Registrado");
});

test("a ordem em que as candidatas chegam não muda a escolha", () => {
  // Se dependesse da ordem do resultado, dependeria do plano do Postgres.
  const a = escolherContraparte("pg_1", "09714600510", [VINCULADO, POR_DOCUMENTO]);
  const b = escolherContraparte("pg_1", "09714600510", [POR_DOCUMENTO, VINCULADO]);
  assert.equal(a?.id, b?.id);
  assert.equal(a?.id, "cb_vinculo");
});

test("sem vínculo, o documento serve", () => {
  const escolhido = escolherContraparte("pg_9", "09714600510", [POR_DOCUMENTO]);
  assert.equal(escolhido?.nome, "Inferido Por Documento");
});

test("duplicata desempata por id — o telefone não muda entre dois carregamentos", () => {
  // Documento duplicado existe nesta base: `api/backoffice/clientes` tem
  // lógica de unificação por causa disso. Sem desempate, qual telefone aparece
  // seria escolha do plano de execução.
  const primeira: Contraparte = { ...POR_DOCUMENTO, id: "cb_aaa", telefone: "71-1111-1111" };
  const segunda: Contraparte = { ...POR_DOCUMENTO, id: "cb_bbb", telefone: "71-2222-2222" };
  assert.equal(escolherContraparte("pg_9", "09714600510", [primeira, segunda])?.id, "cb_aaa");
  assert.equal(escolherContraparte("pg_9", "09714600510", [segunda, primeira])?.id, "cb_aaa");
});

test("candidata de outro titular é ignorada", () => {
  // A consulta traz as candidatas de TODOS os titulares de uma vez — se o
  // filtro falhasse, um cliente receberia o telefone de outro.
  const deOutro: Contraparte = {
    id: "cb_outro",
    pessoaGrupoId: "pg_outro",
    documento: "11111111111",
    nome: "Outra Pessoa",
    telefone: "71-3333-3333",
  };
  assert.equal(escolherContraparte("pg_1", "09714600510", [deOutro]), null);
});

test("documento vazio não casa com documento vazio", () => {
  // `PessoaGrupo.cpfCnpj` é canônico e não deveria ser vazio, mas
  // `ClienteBackoffice.cpfCnpj` é nullable e vira "" na normalização. Sem esta
  // guarda, todo cliente sem documento casaria com todo titular sem documento.
  const semDoc: Contraparte = { ...POR_DOCUMENTO, documento: "", pessoaGrupoId: null };
  assert.equal(escolherContraparte("pg_1", "", [semDoc]), null);
});

// ── O fuso ────────────────────────────────────────────────────────────────

test("diaCivil devolve o dia da Bahia, não o do UTC", () => {
  // 29/08 00:30Z é ainda 28/08 21:30 na Bahia. Sem isto, toda noite por três
  // horas o contrato que vence hoje aparecia como ATRASADO e o cabeçalho
  // mostrava a data de amanhã.
  const noiteNaBahia = new Date("2026-08-29T00:30:00Z");
  assert.equal(diaCivil(noiteNaBahia).toISOString().slice(0, 10), "2026-08-28");
});

test("de manhã, UTC e Bahia concordam", () => {
  const manha = new Date("2026-08-28T13:00:00Z");
  assert.equal(diaCivil(manha).toISOString().slice(0, 10), "2026-08-28");
});

test("o contrato que vence hoje não vira atrasado às 21h", () => {
  // O teste que amarra o defeito ao comportamento visível, e não só à função.
  const venceHoje = new Date(Date.UTC(2026, 7, 28, 12, 0, 0));
  const consultaDeNoite = diaCivil(new Date("2026-08-29T00:30:00Z"));
  assert.equal(diasAte(venceHoje, consultaDeNoite), 0);
  assert.equal(faixaDoContrato(venceHoje, "auto", consultaDeNoite, REGUA_PADRAO), "vencendo");
});

test("diaCivil ancora ao meio-dia UTC, como o motor grava vigência", () => {
  // Mesma âncora de `montarData` — é o que mantém a comparação entre as duas
  // datas livre de borda de fuso.
  assert.equal(diaCivil(new Date("2026-08-28T13:00:00Z")).getUTCHours(), 12);
});

// ── semContato: quantas ligações são impossíveis hoje ─────────────────────

const linhaDaFila = (telefone: string | null): Parameters<typeof contarSemContato>[0][number] => ({
  contratoId: `c_${telefone ?? "nulo"}`,
  faixa: "atrasado",
  dias: -5,
  nome: null,
  telefone,
  cpfCnpj: "09714600510",
  tipoProduto: "auto",
  parceiro: "Porto",
  numeroContrato: "AP-1",
  fimVigencia: new Date(),
  status: "ativo",
  atendenteCorretora: null,
});

test("semContato conta quem não tem telefone em lugar nenhum do grupo", () => {
  const fila = [linhaDaFila("71-90000-0001"), linhaDaFila(null), linhaDaFila(null)];
  assert.equal(contarSemContato(fila), 2);
});

test("telefone em branco conta como ausente — quem vai discar não disca espaço", () => {
  // Contá-lo como contato faria o número mentir para baixo, na direção que
  // esconde o problema.
  assert.equal(contarSemContato([linhaDaFila(""), linhaDaFila("   ")]), 2);
});

test("fila vazia não tem ligação impossível", () => {
  assert.equal(contarSemContato([]), 0);
});
