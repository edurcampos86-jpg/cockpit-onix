import assert from "node:assert/strict";
import { test } from "node:test";

import { comoConduzirPorPat, montarBriefing } from "./briefing.ts";

const AGORA = new Date("2026-08-22T12:00:00Z");

const vazio = { agora: AGORA, interacoes: [], reunioes: [], tarefas: [], pat: null };

test("cliente sem histórico nenhum devolve briefing vazio, não quebra", () => {
  const b = montarBriefing(vazio);
  assert.deepEqual(b.momentoDeVida, []);
  assert.deepEqual(b.pautaSugerida, []);
  assert.equal(b.resumo.diasDesdeUltimoContato, null);
  assert.equal(b.resumo.totalPendenciasAbertas, 0);
});

// ── Json defensivo: `pautas`/`pendencias` vêm como unknown do banco e há
// linhas antigas com shape diferente. Degradar para vazio, nunca lançar.

test("pendencias malformadas degradam para vazio sem lançar", () => {
  const b = montarBriefing({
    ...vazio,
    reunioes: [
      { id: "r1", data: "2026-03-12T10:00:00Z", tipoCadencia: null, pautas: "nao-e-array", pendencias: 42, proximosPassos: null },
    ],
  });
  assert.equal(b.resumo.totalPendenciasAbertas, 0);
});

test("pendências saem separadas por lado, com a reunião de origem", () => {
  const b = montarBriefing({
    ...vazio,
    reunioes: [
      {
        id: "r1",
        data: "2026-03-12T10:00:00Z",
        tipoCadencia: "trimestral",
        pautas: [{ texto: "Previdência" }],
        pendencias: { assessor: ["Simular PGBL"], cliente: ["Mandar extrato do INSS"] },
        proximosPassos: null,
      },
    ],
  });
  assert.equal(b.pendencias.assessor.length, 1);
  assert.equal(b.pendencias.cliente.length, 1);
  assert.equal(b.pendencias.cliente[0]!.texto, "Mandar extrato do INSS");
  assert.equal(b.pendencias.cliente[0]!.origem, "reunião de 12/03");
});

test("próximo passo já concluído não vira pendência", () => {
  const b = montarBriefing({
    ...vazio,
    reunioes: [
      {
        id: "r1",
        data: "2026-03-12T10:00:00Z",
        tipoCadencia: null,
        pautas: null,
        pendencias: null,
        proximosPassos: [
          { texto: "Abrir conta", concluido: true },
          { texto: "Levar proposta", concluido: false },
        ],
      },
    ],
  });
  assert.equal(b.pendencias.assessor.length, 1);
  assert.equal(b.pendencias.assessor[0]!.texto, "Levar proposta");
});

// ── A ordem da pauta é decisão de produto, não estética: o que o CLIENTE deve
// vem primeiro, porque cobrar no fim da reunião é como não cobrar.

test("pauta abre cobrando o cliente, depois o que o assessor entrega", () => {
  const b = montarBriefing({
    ...vazio,
    tarefas: [
      { titulo: "Simular PGBL", responsavel: "assessor", prazo: null, responsavelNome: null },
      { titulo: "Mandar extrato", responsavel: "cliente", prazo: null, responsavelNome: null },
    ],
  });
  assert.equal(b.pautaSugerida[0], "Cobrar: Mandar extrato");
  assert.equal(b.pautaSugerida[1], "Entregar: Simular PGBL");
});

test("pauta não repete o mesmo tópico de duas reuniões", () => {
  const r = (id: string, data: string) => ({
    id, data, tipoCadencia: null, pautas: [{ texto: "Previdência" }], pendencias: null, proximosPassos: null,
  });
  const b = montarBriefing({ ...vazio, reunioes: [r("r1", "2026-03-12T10:00:00Z"), r("r2", "2026-01-10T10:00:00Z")] });
  assert.equal(b.pautaSugerida.filter((p) => p === "Retomar: Previdência").length, 1);
});

test("dias desde o último contato conta do registro mais recente", () => {
  const b = montarBriefing({
    ...vazio,
    interacoes: [{ tipo: "ligacao", assunto: "Aporte", resumo: null, data: "2026-08-12T12:00:00Z" }],
  });
  assert.equal(b.resumo.diasDesdeUltimoContato, 10);
});

test("contato com data futura não vira 'há -N dias'", () => {
  const b = montarBriefing({
    ...vazio,
    interacoes: [{ tipo: "ligacao", assunto: "Agendada", resumo: null, data: "2026-09-01T12:00:00Z" }],
  });
  assert.equal(b.resumo.diasDesdeUltimoContato, 0);
});

// ── "Como conduzir" é a parte opinativa. Cada frase tem que ser rastreável a
// um eixo do PAT, senão o Eduardo não consegue discordar dela.

test("sem PAT, o briefing diz isso em vez de inventar orientação", () => {
  const l = comoConduzirPorPat(null);
  assert.equal(l.length, 1);
  assert.match(l[0]!, /Sem PAT vigente/);
});

test("orientação social e técnica dão instruções opostas", () => {
  const social = comoConduzirPorPat({
    arquetipoCodigo: 76, arquetipoNome: "Promocional de Ação Livre",
    perspectiva: null, orientacao: "Social", ambienteNome: null,
  });
  const tecnico = comoConduzirPorPat({
    arquetipoCodigo: null, arquetipoNome: null,
    perspectiva: null, orientacao: "Técnico", ambienteNome: null,
  });
  assert.ok(social.some((l) => /conversa/i.test(l)));
  assert.ok(tecnico.some((l) => /número na frente/i.test(l)));
});

test("perspectiva baixa pede passo curto; alta libera sucessão", () => {
  const baixa = comoConduzirPorPat({ arquetipoCodigo: null, arquetipoNome: null, perspectiva: "Baixa", orientacao: null, ambienteNome: null });
  const alta = comoConduzirPorPat({ arquetipoCodigo: null, arquetipoNome: null, perspectiva: "Alta", orientacao: null, ambienteNome: null });
  assert.ok(baixa.some((l) => /passo curto/i.test(l)));
  assert.ok(alta.some((l) => /sucessão/i.test(l)));
});

test("PAT vigente sem nenhum eixo preenchido não devolve lista vazia", () => {
  const l = comoConduzirPorPat({ arquetipoCodigo: null, arquetipoNome: null, perspectiva: null, orientacao: null, ambienteNome: null });
  assert.equal(l.length, 1);
});
