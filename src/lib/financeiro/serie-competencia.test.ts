import { test } from "node:test";
import assert from "node:assert/strict";
import {
  montarSerie,
  competenciaMenos,
  proximaCompetencia,
  type LinhaCompetencia,
} from "./serie-competencia";

/* ── ARITMÉTICA DE COMPETÊNCIA, SEM PASSAR POR Date ────────────────────── */

test("virada de ano nos dois sentidos", () => {
  assert.equal(proximaCompetencia("2026-12"), "2027-01");
  assert.equal(proximaCompetencia("2026-01"), "2026-02");
  assert.equal(competenciaMenos("2027-01", 1), "2026-12");
  assert.equal(competenciaMenos("2026-03", 12), "2025-03");
});

test("competência sempre com dois dígitos no mês — é o que faz ORDER BY funcionar", () => {
  // A ordem lexicográfica de "AAAA-MM" só bate com a cronológica se o mês
  // tiver dois dígitos. "2026-9" ordenaria depois de "2026-10".
  assert.equal(competenciaMenos("2026-10", 1), "2026-09");
  assert.equal(proximaCompetencia("2026-09"), "2026-10");
});

/* ── O PONTO DO MÓDULO: BURACO NÃO É ZERO ──────────────────────────────── */

const linhas: LinhaCompetencia[] = [
  { competencia: "2026-06", valor: 100_000, clientes: 500 },
  // 2026-07 AUSENTE de propósito
  { competencia: "2026-08", valor: 120_000, clientes: 510 },
];

test("mês sem linha vem marcado como ausente, não como zero", () => {
  const s = montarSerie(linhas, "2026-08", 3);
  assert.deepEqual(
    s.meses.map((m) => [m.competencia, m.presente]),
    [
      ["2026-06", true],
      ["2026-07", false],
      ["2026-08", true],
    ],
  );
});

test("o total soma só os meses presentes — ausente não soma zero, não soma", () => {
  const s = montarSerie(linhas, "2026-08", 3);
  assert.equal(s.total, 220_000);
  assert.equal(s.mesesComDado, 2);
});

test("mês ausente NÃO vira base de comparação do seguinte", () => {
  // Se virasse, agosto compararia contra um zero que ninguém mediu e a tela
  // mostraria alta infinita logo depois de uma falha de coleta.
  const s = montarSerie(linhas, "2026-08", 3);
  const agosto = s.meses.find((m) => m.competencia === "2026-08");
  assert.equal(agosto?.variacao, null);
});

test("variação existe quando os dois meses existem", () => {
  const seguidos: LinhaCompetencia[] = [
    { competencia: "2026-07", valor: 100, clientes: 1 },
    { competencia: "2026-08", valor: 125, clientes: 1 },
  ];
  const s = montarSerie(seguidos, "2026-08", 2);
  assert.equal(s.meses[0].variacao, null); // primeiro da janela, sem base
  assert.equal(s.meses[1].variacao, 0.25);
});

test("anterior valendo ZERO não gera variação — dividir por zero daria Infinity", () => {
  const comZero: LinhaCompetencia[] = [
    { competencia: "2026-07", valor: 0, clientes: 0 },
    { competencia: "2026-08", valor: 500, clientes: 3 },
  ];
  const s = montarSerie(comZero, "2026-08", 2);
  assert.equal(s.meses[1].variacao, null);
  // E zero MEDIDO continua presente — é fato do negócio, não falha de coleta.
  assert.equal(s.meses[0].presente, true);
});

/* ── A JANELA ──────────────────────────────────────────────────────────── */

test("a janela tem exatamente o tamanho pedido e termina em `ate`", () => {
  const s = montarSerie([], "2026-08", 12);
  assert.equal(s.meses.length, 12);
  assert.equal(s.meses[0].competencia, "2025-09");
  assert.equal(s.meses[11].competencia, "2026-08");
});

test("linha FORA da janela é ignorada — não infla o total", () => {
  const antiga: LinhaCompetencia[] = [
    { competencia: "2024-01", valor: 9_999_999, clientes: 1 },
    { competencia: "2026-08", valor: 100, clientes: 1 },
  ];
  const s = montarSerie(antiga, "2026-08", 3);
  assert.equal(s.total, 100);
});

test("base vazia: total zero, nenhum mês com dado, nenhuma última competência", () => {
  // É o estado real hoje se o btg-enrich nunca rodou — e a tela precisa
  // dizer isso, não desenhar uma linha reta no chão.
  const s = montarSerie([], "2026-08", 12);
  assert.equal(s.total, 0);
  assert.equal(s.mesesComDado, 0);
  assert.equal(s.ultimaComDado, null);
  assert.ok(s.meses.every((m) => !m.presente));
});

test("ultimaComDado é a mais RECENTE presente, não a última da janela", () => {
  const s = montarSerie(linhas, "2026-09", 4); // 2026-09 sem linha
  assert.equal(s.ultimaComDado, "2026-08");
});

/* ── CONFERÊNCIA À MÃO ─────────────────────────────────────────────────── */

test("caso conferido à mão: 12 meses, 3 com dado", () => {
  // 2026-01: 10.000 · 2026-04: 12.500 · 2026-08: 20.000 → total 42.500.
  // Variação de abril: null (março ausente). De agosto: null (julho ausente).
  const reais: LinhaCompetencia[] = [
    { competencia: "2026-01", valor: 10_000, clientes: 100 },
    { competencia: "2026-04", valor: 12_500, clientes: 110 },
    { competencia: "2026-08", valor: 20_000, clientes: 130 },
  ];
  const s = montarSerie(reais, "2026-08", 12);
  assert.equal(s.total, 42_500);
  assert.equal(s.mesesComDado, 3);
  assert.equal(s.ultimaComDado, "2026-08");
  assert.ok(s.meses.every((m) => m.variacao === null));
});
