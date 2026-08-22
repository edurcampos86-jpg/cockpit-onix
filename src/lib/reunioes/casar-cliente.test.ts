import { test } from "node:test";
import assert from "node:assert/strict";
import {
  casarClientePorParticipantes,
  normalizarNome,
  type ClienteCandidato,
} from "./casar-cliente";

const BASE: ClienteCandidato[] = [
  { id: "c1", nome: "Jorge Coelho", nomeCompleto: "Jorge Coelho de Souza", apelido: null },
  { id: "c2", nome: "Maria Eduarda", nomeCompleto: "Maria Eduarda Nogueira", apelido: "Duda" },
  { id: "c3", nome: "Ana Paula", nomeCompleto: null, apelido: null },
  { id: "c4", nome: "Sérgia Regina", nomeCompleto: null, apelido: null },
];

test("normaliza acento, caixa e pontuação", () => {
  assert.equal(normalizarNome("Sérgia  Regina"), "sergia regina");
  assert.equal(normalizarNome("JOÃO D'ÁVILA"), "joao d avila");
});

test("casa pelo nome curto", () => {
  const r = casarClientePorParticipantes(["Jorge Coelho"], BASE);
  assert.deepEqual(r, {
    tipo: "casou",
    clienteId: "c1",
    nome: "Jorge Coelho",
    participante: "Jorge Coelho",
  });
});

test("casa pelo nome completo e pelo apelido", () => {
  assert.equal(
    (casarClientePorParticipantes(["Jorge Coelho de Souza"], BASE) as { clienteId: string })
      .clienteId,
    "c1",
  );
  assert.equal(
    (casarClientePorParticipantes(["Duda"], BASE) as { clienteId: string }).clienteId,
    "c2",
  );
});

test("acento no participante não impede o casamento", () => {
  assert.equal(
    (casarClientePorParticipantes(["sergia regina"], BASE) as { clienteId: string }).clienteId,
    "c4",
  );
});

test("NÃO casa por substring — é a regra que o match de Lead erra", () => {
  // `Lead` usa `name: { contains: name }`: "Ana" acharia "Ana Paula". Aqui não.
  assert.deepEqual(casarClientePorParticipantes(["Ana"], BASE), { tipo: "nenhum" });
  assert.deepEqual(casarClientePorParticipantes(["Jorge"], BASE), { tipo: "nenhum" });
});

test("dois clientes com o mesmo nome = ambíguo, nunca palpite", () => {
  const homonimos: ClienteCandidato[] = [
    { id: "a", nome: "Carlos Silva" },
    { id: "b", nome: "Carlos Silva" },
  ];
  assert.deepEqual(casarClientePorParticipantes(["Carlos Silva"], homonimos), {
    tipo: "ambiguo",
    participante: "Carlos Silva",
    clienteIds: ["a", "b"],
  });
});

test("primeiro nome do time sozinho não casa com cliente homônimo", () => {
  // A sala tem o assessor. "Eduardo" solto é ele, não o cliente.
  const comEduardo: ClienteCandidato[] = [{ id: "x", nome: "Eduardo" }];
  assert.deepEqual(casarClientePorParticipantes(["Eduardo"], comEduardo), { tipo: "nenhum" });
});

test("cliente com nome composto que começa igual ao do time ainda casa", () => {
  const comEduardo: ClienteCandidato[] = [{ id: "y", nome: "Eduardo Nogueira" }];
  assert.equal(
    (casarClientePorParticipantes(["Eduardo Nogueira"], comEduardo) as { clienteId: string })
      .clienteId,
    "y",
  );
});

test("percorre a lista até achar — o assessor costuma vir primeiro", () => {
  const r = casarClientePorParticipantes(["Eduardo", "Duda"], BASE);
  assert.equal((r as { clienteId: string }).clienteId, "c2");
});

test("entradas sujas não quebram", () => {
  assert.deepEqual(casarClientePorParticipantes(null, BASE), { tipo: "nenhum" });
  assert.deepEqual(casarClientePorParticipantes(undefined, BASE), { tipo: "nenhum" });
  assert.deepEqual(casarClientePorParticipantes([""], BASE), { tipo: "nenhum" });
  assert.deepEqual(casarClientePorParticipantes(["   "], BASE), { tipo: "nenhum" });
  assert.deepEqual(
    casarClientePorParticipantes([null as unknown as string, "Duda"], BASE),
    { tipo: "casou", clienteId: "c2", nome: "Maria Eduarda", participante: "Duda" },
  );
});

test("base vazia devolve nenhum", () => {
  assert.deepEqual(casarClientePorParticipantes(["Jorge Coelho"], []), { tipo: "nenhum" });
});
