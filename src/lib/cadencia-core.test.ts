import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DIAS_REUNIAO_POR_CLASSE,
  diasCadenciaReuniao,
  riscoEvasaoReuniao,
} from "./cadencia-core.ts";

const DIA = 24 * 60 * 60 * 1000;
const AGORA = Date.UTC(2026, 7, 1); // 2026-08-01, fixo — testes não podem depender do relógio
const dias = (n: number) => AGORA + n * DIA;

// ── Tetos por classe. Números decididos com o Eduardo: A=3m, C=6m, B=4m.
// B não segue a proporção do contato (que seria 270d, mais frouxo que o C).

test("tetos: A=90, B=120, C=180", () => {
  assert.equal(DIAS_REUNIAO_POR_CLASSE.A, 90);
  assert.equal(DIAS_REUNIAO_POR_CLASSE.B, 120);
  assert.equal(DIAS_REUNIAO_POR_CLASSE.C, 180);
});

test("classe desconhecida ou nula cai no padrão de 180", () => {
  assert.equal(diasCadenciaReuniao(null), 180);
  assert.equal(diasCadenciaReuniao("Z"), 180);
  assert.equal(diasCadenciaReuniao(""), 180);
});

test("classe é case-insensitive", () => {
  assert.equal(diasCadenciaReuniao("a"), 90);
  assert.equal(diasCadenciaReuniao("b"), 120);
});

// ── Override manual: a razão de existir é o cliente que quebra a régua teórica.

test("override manual vence a régua da classe", () => {
  assert.equal(diasCadenciaReuniao("A", 45), 45);
  assert.equal(diasCadenciaReuniao("C", 30), 30);
});

test("override inválido cai no padrão da classe", () => {
  for (const v of [0, -10, null, undefined, NaN]) {
    assert.equal(diasCadenciaReuniao("A", v as number | null), 90, `override=${v}`);
  }
});

test("override é sinalizado no retorno", () => {
  const com = riscoEvasaoReuniao("A", null, null, 45, AGORA);
  const sem = riscoEvasaoReuniao("A", null, null, null, AGORA);
  assert.equal(com.override, true);
  assert.equal(com.cadencia, 45);
  assert.equal(sem.override, false);
  assert.equal(sem.cadencia, 90);
});

test("override igual ao padrão da classe não conta como override", () => {
  const r = riscoEvasaoReuniao("A", null, null, 90, AGORA);
  assert.equal(r.override, false);
});

// ── O caso grave: prazo vencido e nada agendado.

test("A com última reunião há 100 dias e nada marcado → risco", () => {
  const r = riscoEvasaoReuniao("A", new Date(dias(-100)), null, null, AGORA);
  assert.equal(r.status, "risco");
  assert.equal(r.motivo, "sem-agenda-vencida");
  assert.equal(r.diasAteLimite, -10);
});

test("C aguenta os mesmos 100 dias sem virar risco", () => {
  const r = riscoEvasaoReuniao("C", new Date(dias(-100)), null, null, AGORA);
  assert.equal(r.status, "ok");
  assert.equal(r.motivo, "sem-agenda-no-prazo");
});

test("o mesmo cliente A com override de 180 sai do risco", () => {
  const r = riscoEvasaoReuniao("A", new Date(dias(-100)), null, 180, AGORA);
  assert.equal(r.status, "ok");
  assert.equal(r.override, true);
});

// ── Reunião agendada.

test("agendada dentro do teto → ok", () => {
  const r = riscoEvasaoReuniao("A", new Date(dias(-30)), new Date(dias(10)), null, AGORA);
  assert.equal(r.status, "ok");
  assert.equal(r.motivo, "agendada-no-prazo");
});

test("agendada DEPOIS do teto → atenção, não ok", () => {
  // Última há 30d, teto A=90 → limite em +60d. Marcada para +75d: existe
  // agenda, mas o ciclo estoura.
  const r = riscoEvasaoReuniao("A", new Date(dias(-30)), new Date(dias(75)), null, AGORA);
  assert.equal(r.status, "atencao");
  assert.equal(r.motivo, "agendada-fora-do-teto");
});

test("agendada exatamente no limite ainda é ok", () => {
  const r = riscoEvasaoReuniao("A", new Date(dias(-30)), new Date(dias(60)), null, AGORA);
  assert.equal(r.status, "ok");
});

test("reunião marcada tira do risco mesmo com prazo já vencido", () => {
  // Vencido há muito, mas já tem reunião marcada — não é o caso grave.
  const r = riscoEvasaoReuniao("A", new Date(dias(-200)), new Date(dias(5)), null, AGORA);
  assert.notEqual(r.status, "risco");
});

// ── Faixa de atenção (>=80% do teto decorrido, nada marcado).

test("A sem agenda com 80% do teto decorrido → atenção", () => {
  const r = riscoEvasaoReuniao("A", new Date(dias(-72)), null, null, AGORA); // 72/90 = 80%
  assert.equal(r.status, "atencao");
  assert.equal(r.motivo, "sem-agenda-no-prazo");
});

test("A sem agenda com 50% do teto decorrido → ok", () => {
  const r = riscoEvasaoReuniao("A", new Date(dias(-45)), null, null, AGORA);
  assert.equal(r.status, "ok");
});

// ── Cliente sem histórico: não pode nascer vermelho.

test("sem reunião passada nem futura conta o prazo de hoje, não vira risco", () => {
  const r = riscoEvasaoReuniao("A", null, null, null, AGORA);
  assert.equal(r.status, "ok");
  assert.equal(r.motivo, "sem-agenda-no-prazo");
  assert.equal(r.diasAteLimite, 90);
});

test("sem reunião passada mas com uma marcada → ok", () => {
  const r = riscoEvasaoReuniao("A", null, new Date(dias(20)), null, AGORA);
  assert.equal(r.status, "ok");
  assert.equal(r.motivo, "agendada-no-prazo");
});

// ── Aceita string ISO além de Date (é o que vem serializado do server).

test("aceita data em string ISO", () => {
  const r = riscoEvasaoReuniao(
    "A",
    new Date(dias(-100)).toISOString(),
    null,
    null,
    AGORA,
  );
  assert.equal(r.status, "risco");
});
