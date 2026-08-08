import assert from "node:assert/strict";
import { test } from "node:test";
import { chavesLigadasDe, chavesNaoReconhecidasDe, planejarConserto } from "./ligadas";
import { compararComEsperado } from "./esperadas";

/* Este arquivo trava a divergência entre o que o SMOKE cobra
 * (`chavesLigadas()` → `/api/health`) e o que a TELA mostra. Os dois passaram a
 * derivar de `chavesLigadasDe`, então testar a função pura cobre os dois — sem
 * precisar de banco, que o CI não tem. */

const AMOSTRA = [
  { key: "HUB_ECOSSISTEMA", ligada: true },
  { key: "COCKPIT_REUNIAO", ligada: false },
  { key: "RBAC_ENFORCEMENT", ligada: true },
  { key: "LIMIAR_VACUO_DIAS", ligada: null }, // flag de VALOR
];

test("devolve só as ligadas", () => {
  assert.deepEqual(chavesLigadasDe(AMOSTRA), ["HUB_ECOSSISTEMA", "RBAC_ENFORCEMENT"]);
});

test("flag de VALOR (ligada: null) não entra — nem como ligada, nem como desligada", () => {
  // O bug que este arquivo existe para impedir: trocar `=== true` por truthy
  // não muda nada aqui, mas trocar por `!== false` faria LIMIAR_VACUO_DIAS
  // entrar na lista e o smoke acusar divergência que não existe.
  assert.ok(!chavesLigadasDe(AMOSTRA).includes("LIMIAR_VACUO_DIAS"));
  assert.equal(chavesLigadasDe([{ key: "X", ligada: null }]).length, 0);
});

test("sai ordenado — a comparação do smoke é textual", () => {
  const fora = [
    { key: "ZZZ", ligada: true },
    { key: "AAA", ligada: true },
    { key: "MMM", ligada: true },
  ];
  assert.deepEqual(chavesLigadasDe(fora), ["AAA", "MMM", "ZZZ"]);
});

test("a ordem da entrada não muda o resultado", () => {
  const a = chavesLigadasDe(AMOSTRA);
  const b = chavesLigadasDe([...AMOSTRA].reverse());
  assert.deepEqual(a, b);
});

test("lista vazia devolve vazia, não undefined", () => {
  assert.deepEqual(chavesLigadasDe([]), []);
});

test("não muta a entrada", () => {
  const entrada = [
    { key: "ZZZ", ligada: true },
    { key: "AAA", ligada: true },
  ];
  chavesLigadasDe(entrada);
  assert.deepEqual(
    entrada.map((f) => f.key),
    ["ZZZ", "AAA"],
    "o .sort() vazou para o array do chamador",
  );
});

test("o que o smoke cobra e o que a tela compara saem da MESMA lista", () => {
  // Simula os dois lados: o health publica `chavesLigadasDe(...)`, e a tela
  // alimenta `compararComEsperado` com `chavesLigadasDe(...)` do mesmo estado.
  // Com a lista esperada igual ao estado, não pode haver divergência.
  const ligadas = chavesLigadasDe(AMOSTRA);
  const comparacao = compararComEsperado(ligadas, ligadas.join(","));
  assert.equal(comparacao.diverge, false);
  assert.deepEqual(comparacao.sobrando, []);
  assert.deepEqual(comparacao.faltando, []);
});

test("estado que o smoke reprova é o mesmo que a tela acusa", () => {
  const ligadas = chavesLigadasDe(AMOSTRA);
  const comparacao = compararComEsperado(ligadas, "COCKPIT_REUNIAO");
  assert.equal(comparacao.diverge, true);
  assert.deepEqual(comparacao.faltando, ["COCKPIT_REUNIAO"]);
  assert.deepEqual(comparacao.sobrando, ["HUB_ECOSSISTEMA", "RBAC_ENFORCEMENT"]);
});

test("chavesNaoReconhecidasDe: só quem tem o campo em true, ordenado", () => {
  const flags = [
    { key: "ZULU", ligada: true, valorNaoReconhecido: true },
    { key: "ALFA", ligada: false, valorNaoReconhecido: true },
    { key: "BRAVO", ligada: true, valorNaoReconhecido: false },
    { key: "CHARLIE", ligada: null }, // flag de valor, campo ausente
  ];
  assert.deepEqual(chavesNaoReconhecidasDe(flags), ["ALFA", "ZULU"]);
});

test("campo ausente conta como NÃO suspeita, não como sem opinião", () => {
  // `FlagComEstado` tem o campo opcional (a tela client já usava o tipo sem
  // ele). `undefined` truthy-falsy daria o mesmo aqui, mas o `=== true` é o
  // que impede um refactor futuro de transformar ausência em alarme.
  assert.deepEqual(chavesNaoReconhecidasDe([{ key: "A", ligada: true }]), []);
});

test("suspeita e ligada são eixos independentes", () => {
  // Uma flag pode estar LIGADA e ainda ter valor suspeito? Não pelo caminho
  // normal — mas a função não pode assumir isso: ela filtra por um campo só.
  const flags = [{ key: "A", ligada: true, valorNaoReconhecido: true }];
  assert.deepEqual(chavesLigadasDe(flags), ["A"]);
  assert.deepEqual(chavesNaoReconhecidasDe(flags), ["A"]);
});

/* ── `planejarConserto`: as três recusas do botão em lote ────────────────── */

const suspeita = (key, extra = {}) => ({
  key, ligada: false, valorNaoReconhecido: true, intencao: true, ...extra,
});

test("aplica só as suspeitas com intenção clara, sem env e sem efeito pesado", () => {
  const plano = planejarConserto([
    suspeita("SIMPLES_ON"),
    suspeita("SIMPLES_OFF", { intencao: false }),
    { key: "SAUDAVEL", ligada: true, valorNaoReconhecido: false, intencao: null },
  ]);
  assert.deepEqual(plano.aplicar, [
    { key: "SIMPLES_ON", ligar: true },
    { key: "SIMPLES_OFF", ligar: false },
  ]);
  assert.deepEqual(plano.deFora, []);
});

test("flag de EFEITO PESADO fica de fora — o lote não pula N confirmações", () => {
  // É a recusa mais tentadora de esquecer: são justamente essas que dá vontade
  // de arrumar de uma vez. Cada uma tem um aviso próprio que precisa ser lido.
  const plano = planejarConserto([suspeita("PESADA", { impacto: "alto" })]);
  assert.deepEqual(plano.aplicar, []);
  assert.deepEqual(plano.deFora, [{ key: "PESADA", motivo: "efeito_pesado" }]);
});

test("flag vinda do ENV fica de fora — gravar criaria a segunda fonte", () => {
  const plano = planejarConserto([suspeita("DO_ENV", { origem: "env" })]);
  assert.deepEqual(plano.aplicar, []);
  assert.deepEqual(plano.deFora, [{ key: "DO_ENV", motivo: "env" }]);
});

test("intenção ambígua fica de fora — consertar para o lado errado é pior", () => {
  const plano = planejarConserto([suspeita("LIXO", { intencao: null })]);
  assert.deepEqual(plano.aplicar, []);
  assert.deepEqual(plano.deFora, [{ key: "LIXO", motivo: "ambigua" }]);
});

test("env vence efeito pesado na hora de explicar o motivo", () => {
  // Uma flag pode cair em mais de uma recusa. `origem: env` é a primeira
  // testada porque é a que muda ONDE se conserta — dizer "efeito pesado" para
  // algo que nem se conserta pela tela mandaria a pessoa para o lugar errado.
  const plano = planejarConserto([suspeita("AMBAS", { origem: "env", impacto: "alto" })]);
  assert.deepEqual(plano.deFora, [{ key: "AMBAS", motivo: "env" }]);
});

test("flag saudável nunca entra no plano, nem para aplicar nem para explicar", () => {
  const plano = planejarConserto([
    { key: "OK", ligada: true, valorNaoReconhecido: false, intencao: true },
    { key: "SEM_CAMPO", ligada: null, intencao: null },
  ]);
  assert.deepEqual(plano, { aplicar: [], deFora: [] });
});
