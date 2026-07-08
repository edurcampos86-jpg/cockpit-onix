import assert from "node:assert/strict";
import { test } from "node:test";

import { derivarPendenciasGlobais, type PendenciaGlobalInput } from "./pendencias-globais.ts";

const HOJE = "2026-07-08T12:00:00.000Z";

function reuniao(p: Partial<PendenciaGlobalInput> & Pick<PendenciaGlobalInput, "reuniaoId" | "clienteId" | "clienteNome" | "pendencias">): PendenciaGlobalInput {
  return { data: "2026-07-01T00:00:00.000Z", dataRetorno: null, ...p };
}

test("global — só conta pendências abertas (concluido filtra)", () => {
  const r = derivarPendenciasGlobais(
    [
      reuniao({
        reuniaoId: "r1", clienteId: "c1", clienteNome: "Erico",
        pendencias: {
          assessor: [{ texto: "Enviar proposta", concluido: false }, { texto: "Feito", concluido: true }],
          cliente: [{ texto: "Mandar RG", concluido: false }],
        },
      }),
    ],
    HOJE,
  );
  assert.equal(r.totalAbertas, 2);
  assert.equal(r.totalClientes, 1);
  assert.equal(r.grupos[0].abertas, 2);
  assert.deepEqual(
    r.grupos[0].itens.map((i) => i.texto).sort(),
    ["Enviar proposta", "Mandar RG"],
  );
});

test("global — agrupa por cliente", () => {
  const r = derivarPendenciasGlobais(
    [
      reuniao({ reuniaoId: "r1", clienteId: "c1", clienteNome: "Erico", pendencias: { assessor: [{ texto: "A", concluido: false }] } }),
      reuniao({ reuniaoId: "r2", clienteId: "c2", clienteNome: "Maria", pendencias: { assessor: [{ texto: "B", concluido: false }] } }),
    ],
    HOJE,
  );
  assert.equal(r.totalClientes, 2);
  assert.deepEqual(r.grupos.map((g) => g.clienteNome).sort(), ["Erico", "Maria"]);
});

test("global — atrasada quando dataRetorno < hoje; futura/null não", () => {
  const r = derivarPendenciasGlobais(
    [
      reuniao({ reuniaoId: "r1", clienteId: "c1", clienteNome: "Erico", dataRetorno: "2026-06-01T00:00:00.000Z", pendencias: { assessor: [{ texto: "vencida", concluido: false }] } }),
      reuniao({ reuniaoId: "r2", clienteId: "c2", clienteNome: "Maria", dataRetorno: "2026-12-01T00:00:00.000Z", pendencias: { assessor: [{ texto: "futura", concluido: false }] } }),
      reuniao({ reuniaoId: "r3", clienteId: "c3", clienteNome: "Joao", dataRetorno: null, pendencias: { assessor: [{ texto: "sem prazo", concluido: false }] } }),
    ],
    HOJE,
  );
  assert.equal(r.totalAtrasadas, 1);
  const erico = r.grupos.find((g) => g.clienteNome === "Erico")!;
  assert.equal(erico.atrasadas, 1);
  assert.equal(erico.itens[0].atrasada, true);
});

test("global — cliente com atrasada vem primeiro na ordenação", () => {
  const r = derivarPendenciasGlobais(
    [
      reuniao({ reuniaoId: "r1", clienteId: "c1", clienteNome: "SemAtraso", dataRetorno: null, pendencias: { assessor: [{ texto: "x", concluido: false }] } }),
      reuniao({ reuniaoId: "r2", clienteId: "c2", clienteNome: "ComAtraso", dataRetorno: "2026-06-01T00:00:00.000Z", pendencias: { assessor: [{ texto: "y", concluido: false }] } }),
    ],
    HOJE,
  );
  assert.equal(r.grupos[0].clienteNome, "ComAtraso");
});

test("global — pendencias malformadas/nulas não quebram (degrada p/ vazio)", () => {
  const r = derivarPendenciasGlobais(
    [
      reuniao({ reuniaoId: "r1", clienteId: "c1", clienteNome: "Erico", pendencias: null }),
      reuniao({ reuniaoId: "r2", clienteId: "c2", clienteNome: "Maria", pendencias: "lixo" }),
    ],
    HOJE,
  );
  assert.equal(r.totalAbertas, 0);
  assert.equal(r.totalClientes, 0);
});
