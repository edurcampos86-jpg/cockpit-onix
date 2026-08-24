import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DIAS_POR_CLASSE,
  DIAS_REUNIAO_POR_CLASSE,
  TOQUES_POR_CLASSE,
  alvoContado,
  alvoOficial,
  contaComoToque,
  cumprimentoCadencia,
  diasCadenciaReuniao,
  inicioJanelaToques,
  riscoEvasaoReuniao,
  statusTermometro,
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

// ============================================================================
// RÉGUA DE TOQUES — a definição oficial do 12-4-2 desde 22/08/2026
// ============================================================================

test("os três alvos oficiais somam 18 / 12 / 7", () => {
  assert.equal(alvoOficial("A"), 18);
  assert.equal(alvoOficial("B"), 12);
  assert.equal(alvoOficial("C"), 7);
});

test("classe A é 12 ligações + 4 reuniões + 2 revisões", () => {
  assert.deepEqual(TOQUES_POR_CLASSE.A, { ligacoes: 12, reunioes: 4, revisoes: 2 });
});

// A revisão está no alvo declarado e FORA da conta. É a diferença entre os dois
// números, e é ela que a tela precisa explicar em vez de mostrar 0/2.
test("o alvo cobrado exclui revisão; o oficial a inclui", () => {
  assert.equal(alvoContado("A"), 16);
  assert.equal(alvoOficial("A"), 18);
  assert.equal(alvoContado("C"), 6);
  assert.equal(alvoOficial("C"), 7);
});

test("classe desconhecida cai no nível mais leve, nunca no mais exigente", () => {
  assert.equal(alvoOficial("Z"), alvoOficial("C"));
  assert.equal(alvoOficial(null), alvoOficial("C"));
  assert.equal(alvoOficial(""), alvoOficial("C"));
});

test("classe é case-insensitive", () => {
  assert.equal(alvoContado("a"), alvoContado("A"));
});

// ── A direção inverteu: mais toques é melhor. O teste existe porque a régua
// antiga ia no sentido oposto e trocar o sinal é o erro fácil.

test("bater o alvo é ok; 80% é atenção; abaixo é alerta", () => {
  assert.equal(cumprimentoCadencia("A", 16, true).status, "ok");
  assert.equal(cumprimentoCadencia("A", 20, true).status, "ok");
  assert.equal(cumprimentoCadencia("A", 13, true).status, "atencao"); // 13/16 = 81%
  assert.equal(cumprimentoCadencia("A", 12, true).status, "alerta"); // 12/16 = 75%
  assert.equal(cumprimentoCadencia("A", 0, true).status, "alerta");
});

// 4,8/6 é exatamente 80%, mas em ponto flutuante dá 0.7999999999999999. Sem a
// comparação em inteiro, o cliente no limite exato cairia para alerta por erro
// de arredondamento — e ninguém acharia o motivo olhando a tela.
test("o limite exato de 80% não escorrega para alerta por ponto flutuante", () => {
  assert.equal(4.8 / 6 >= 0.8, false, "premissa: a divisão direta erra");
  assert.equal(cumprimentoCadencia("C", 4.8, true).status, "atencao");
});

// ── Estado neutro preservado: sem esse cuidado, toda conta recém-aberta
// nasceria reprovada e o KPI despencaria por contas que ninguém errou.

test("cliente sem histórico nenhum é neutro, não alerta", () => {
  const r = cumprimentoCadencia("A", 0, false);
  assert.equal(r.status, "sem-historico");
  assert.equal(r.pct, null);
});

test("o resultado carrega o que a conta NÃO enxerga", () => {
  const r = cumprimentoCadencia("A", 8, true);
  assert.equal(r.alvo, 16);
  assert.equal(r.alvoComRevisao, 18);
  assert.equal(r.revisoesNaoRastreadas, 2);
});

test("contagem negativa não vira pct negativo", () => {
  assert.equal(cumprimentoCadencia("A", -5, true).feitos, 0);
});

// ── Quais tipos contam, conforme especificado: ligação, WhatsApp e presencial.

test("ligação, reunião e whatsapp contam como toque", () => {
  assert.equal(contaComoToque("ligacao"), true);
  assert.equal(contaComoToque("reuniao"), true);
  assert.equal(contaComoToque("whatsapp"), true);
});

// "presencial" não é `tipo`, é `canal` — uma reunião presencial tem
// tipo "reuniao". Se alguém um dia acrescentar "presencial" à lista de tipos,
// este teste avisa que o filtro está no campo errado.
test("presencial não é um tipo — entra por reuniao/ligacao", () => {
  assert.equal(contaComoToque("presencial"), false);
});

test("revisão, e-mail e evento ficam de fora", () => {
  assert.equal(contaComoToque("revisao"), false);
  assert.equal(contaComoToque("email"), false);
  assert.equal(contaComoToque("evento"), false);
});

test("a janela de contagem é de 365 dias", () => {
  const agora = new Date("2026-08-23T00:00:00Z");
  const inicio = inicioJanelaToques(agora);
  assert.equal(Math.round((agora.getTime() - inicio.getTime()) / 86_400_000), 365);
});

// A régua de dias continua existindo — rebaixada a métrica de recência. Se
// alguém a apagar achando que virou órfã, o tooltip e o Painel de Atenção somem.
test("a régua de dias sobrevive como métrica auxiliar", () => {
  assert.equal(DIAS_POR_CLASSE.A, 30);
  assert.equal(statusTermometro("A", null).status, "sem-historico");
});
