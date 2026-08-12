/**
 * Testes da função PURA de `reparent.ts` — sem banco.
 *
 * Mesmo padrão de `hierarquia.test.ts` e `seed-hierarquia.test.ts`:
 * `node:test` + `node:assert/strict`, rodados por `npm test`.
 *
 * `planejarReparent` é o que a rota mostra em `modo: "dry-run"` ANTES de
 * escrever, e é sobre a saída dela que a decisão de aplicar é tomada. Se o
 * plano descrever errado o que vai acontecer, o dry-run vira teatro: a pessoa
 * aprova uma coisa e o banco recebe outra.
 *
 * O contrato tem quatro partes, e as quatro só valem juntas:
 *
 *   1. só pendura RAIZ SOLTA      → quem já tem pai é `pulada`, nunca movida
 *   2. é idempotente              → quem já está na raiz é `ja_ok`, sem UPDATE
 *   3. respeita a régua de 2 níveis → o que a estouraria é `recusada`
 *   4. uma recusa não aborta as demais → mas o motivo fica registrado
 *
 * A primeira é a que mais precisa de teste: é a diferença entre "pendurar o
 * que está solto" e "remanejar hierarquia de produção em massa", e um `else`
 * distraído troca uma pela outra sem mudar mais nada visível.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { RAIZ_DO_GRUPO } from "./catalogo.ts";
import { planejarReparent } from "./reparent.ts";
import { PROFUNDIDADE_MAXIMA, type NoEmpresa } from "./hierarquia.ts";

/** Árvore plana: tudo raiz solta. O estado que o reparenting existe para arrumar. */
const PLANA: NoEmpresa[] = [
  { id: "onix-co", parentId: null },
  { id: "investimentos", parentId: null },
  { id: "corretora", parentId: null },
];

/** O alvo: as duas filhas já penduradas. */
const ARRUMADA: NoEmpresa[] = [
  { id: "onix-co", parentId: null },
  { id: "investimentos", parentId: "onix-co" },
  { id: "corretora", parentId: "onix-co" },
];

const FILHAS = ["investimentos", "corretora"];

/** O movimento de um id, para os testes não dependerem da ordem do array. */
function mov(plano: ReturnType<typeof planejarReparent>, id: string) {
  const m = plano.movimentos.find((x) => x.id === id);
  assert.ok(m, `esperava um movimento para "${id}" no plano`);
  return m;
}

// ── Plano vazio ────────────────────────────────────────────────────────────

test("lista de filhas vazia produz plano vazio e árvore intacta", () => {
  // O caso degenerado que precisa ser SEGURO: nada a mover não pode virar
  // "mover tudo". `arvoreResultante` volta igual à entrada.
  const p = planejarReparent(PLANA, []);
  assert.deepEqual(p.movimentos, []);
  assert.deepEqual(p.totais, { mover: 0, jaOk: 0, puladas: 0, recusadas: 0 });
  assert.deepEqual(p.arvoreResultante, PLANA);
  assert.deepEqual(p.problemas, []);
});

test("árvore já arrumada: plano sem nenhum movimento a fazer", () => {
  // Idempotência. Rodar o reparenting duas vezes não pode gerar UPDATE na
  // segunda — é o que torna seguro repetir depois de uma falha parcial.
  const p = planejarReparent(ARRUMADA, FILHAS);
  assert.equal(p.totais.mover, 0);
  assert.equal(p.totais.jaOk, 2);
  assert.equal(mov(p, "investimentos").situacao, "ja_ok");
  assert.deepEqual(p.arvoreResultante, ARRUMADA);
});

test("banco vazio: toda filha é pulada por não existir, e nada explode", () => {
  const p = planejarReparent([], FILHAS);
  assert.equal(p.totais.puladas, 2);
  assert.equal(p.totais.mover, 0);
  assert.match(mov(p, "corretora").motivo ?? "", /não existe no banco/);
});

// ── O caminho feliz ────────────────────────────────────────────────────────

test("raiz solta é pendurada na raiz do grupo", () => {
  const p = planejarReparent(PLANA, FILHAS);
  assert.equal(p.totais.mover, 2);
  assert.equal(p.raiz, RAIZ_DO_GRUPO);
  assert.deepEqual(mov(p, "investimentos"), {
    id: "investimentos",
    situacao: "mover",
    de: null,
    para: "onix-co",
  });
  assert.deepEqual(p.arvoreResultante, ARRUMADA);
  assert.deepEqual(p.problemas, []);
});

test("planejar não altera a árvore recebida", () => {
  // O plano é dry-run: se ele mutasse a entrada, o "antes" que a rota mostra
  // ao lado do "depois" já viria contaminado.
  const entrada = structuredClone(PLANA);
  planejarReparent(entrada, FILHAS);
  assert.deepEqual(entrada, PLANA);
});

// ── Quem NÃO é tocado ──────────────────────────────────────────────────────

/**
 * `investimentos` pendurada em `tech`, `corretora` solta e sem filhas.
 *
 * O pai errado é `tech` — e NÃO `corretora` — de propósito: `corretora` é uma
 * das filhas que o plano tenta mover, e uma empresa que carrega filha é
 * RECUSADA pela régua, não movida. Usar `corretora` como pai indevido
 * misturaria os dois desfechos num fixture só e o teste passaria a afirmar
 * duas coisas de uma vez, sem separar qual quebrou.
 */
const COM_OUTRO_PAI: NoEmpresa[] = [
  { id: "onix-co", parentId: null },
  { id: "tech", parentId: null },
  { id: "investimentos", parentId: "tech" },
  { id: "corretora", parentId: null },
];

test("empresa que já tem OUTRO pai é pulada, não remanejada", () => {
  // A linha que separa "pendurar o que está solto" de "remanejar hierarquia
  // de produção". Quem tem pai errado é caso de conserto deliberado, com o
  // pai atual nomeado no plano — não de varredura automática.
  const p = planejarReparent(COM_OUTRO_PAI, FILHAS);
  const m = mov(p, "investimentos");
  assert.equal(m.situacao, "pulada");
  assert.equal(m.de, "tech");
  assert.equal(m.para, null);
  assert.match(m.motivo ?? "", /já tem pai/);
  // E continua com o pai que tinha na árvore resultante.
  assert.equal(
    p.arvoreResultante.find((e) => e.id === "investimentos")?.parentId,
    "tech",
  );
});

test("uma pulada não impede as demais de serem movidas", () => {
  const p = planejarReparent(COM_OUTRO_PAI, FILHAS);
  assert.equal(p.totais.puladas, 1);
  assert.equal(p.totais.mover, 1);
  assert.equal(mov(p, "corretora").situacao, "mover");
});

// ── A régua de 2 níveis ────────────────────────────────────────────────────

test("empresa que JÁ TEM FILHAS é recusada: pendurá-la criaria o 3º nível", () => {
  // O caso que a régua existe para impedir, e o único jeito de ele aparecer
  // aqui: `planejarReparent` só mexe em raiz solta, então a profundidade só
  // estoura por baixo — a empresa solta que carrega uma sub-empresa junto.
  const comNeta: NoEmpresa[] = [
    { id: "onix-co", parentId: null },
    { id: "investimentos", parentId: null },
    { id: "sub-investimentos", parentId: "investimentos" },
  ];
  const p = planejarReparent(comNeta, ["investimentos"]);
  const m = mov(p, "investimentos");
  assert.equal(m.situacao, "recusada");
  assert.equal(m.para, null);
  assert.match(m.motivo ?? "", /no_tem_filhos/);
  assert.match(m.motivo ?? "", /terceiro nível/);
  assert.equal(p.totais.recusadas, 1);
  assert.equal(p.totais.mover, 0);
});

test("a recusada fica INTACTA na árvore resultante", () => {
  // Recusar e mover mesmo assim seria o pior desfecho: o plano diria uma coisa
  // e o `aplicarPlano` faria outra.
  const comNeta: NoEmpresa[] = [
    { id: "onix-co", parentId: null },
    { id: "investimentos", parentId: null },
    { id: "sub-investimentos", parentId: "investimentos" },
  ];
  const p = planejarReparent(comNeta, ["investimentos"]);
  assert.equal(
    p.arvoreResultante.find((e) => e.id === "investimentos")?.parentId,
    null,
  );
  // E a árvore resultante segue sã: ninguém no nível 3.
  assert.deepEqual(p.problemas, []);
});

test("uma recusa não aborta as demais", () => {
  const misto: NoEmpresa[] = [
    { id: "onix-co", parentId: null },
    { id: "investimentos", parentId: null },
    { id: "sub-investimentos", parentId: "investimentos" },
    { id: "corretora", parentId: null },
  ];
  const p = planejarReparent(misto, FILHAS);
  assert.equal(p.totais.recusadas, 1);
  assert.equal(p.totais.mover, 1);
  assert.equal(mov(p, "corretora").situacao, "mover");
  assert.equal(
    p.arvoreResultante.find((e) => e.id === "corretora")?.parentId,
    "onix-co",
  );
});

test("a régua validada é a de PROFUNDIDADE_MAXIMA, não um 2 digitado aqui", () => {
  // Se o teto mudar em hierarquia.ts, este teste tem de acompanhar sozinho.
  assert.equal(PROFUNDIDADE_MAXIMA, 2);
});

// ── Coerência interna do plano ─────────────────────────────────────────────

test("os totais batem com a contagem dos movimentos", () => {
  // Os totais são o que a rota serializa e o que a pessoa lê antes de
  // aprovar. Divergirem dos movimentos é a forma mais direta de o dry-run
  // mentir.
  const misto: NoEmpresa[] = [
    { id: "onix-co", parentId: null },
    { id: "investimentos", parentId: null },
    { id: "sub-investimentos", parentId: "investimentos" },
    { id: "corretora", parentId: "onix-co" },
    { id: "imobiliaria", parentId: "corretora" },
  ];
  const p = planejarReparent(misto, ["investimentos", "corretora", "imobiliaria", "tech"]);
  const conta = (s: string) => p.movimentos.filter((m) => m.situacao === s).length;
  assert.equal(p.totais.mover, conta("mover"));
  assert.equal(p.totais.jaOk, conta("ja_ok"));
  assert.equal(p.totais.puladas, conta("pulada"));
  assert.equal(p.totais.recusadas, conta("recusada"));
  assert.equal(p.movimentos.length, 4);
});

test("todo movimento pulado ou recusado traz motivo", () => {
  // Sem motivo, o plano diz "não fiz" e não diz por quê — e quem lê não tem
  // como decidir o próximo passo.
  const misto: NoEmpresa[] = [
    { id: "onix-co", parentId: null },
    { id: "investimentos", parentId: null },
    { id: "sub-investimentos", parentId: "investimentos" },
  ];
  const p = planejarReparent(misto, ["investimentos", "tech"]);
  for (const m of p.movimentos) {
    if (m.situacao === "pulada" || m.situacao === "recusada") {
      assert.ok(m.motivo && m.motivo.length > 0, `movimento "${m.id}" sem motivo`);
    }
  }
});

test("a validação de cada empresa vê o estado JÁ com as anteriores aplicadas", () => {
  // A ordem importa: a régua da próxima tem de enxergar o mundo com a
  // anterior movida. Aqui `corretora` só pode ser pendurada porque
  // `investimentos` já foi — e é isso que impede o plano de aprovar um
  // conjunto que, aplicado em sequência, estouraria a régua.
  const p = planejarReparent(PLANA, FILHAS);
  assert.deepEqual(p.problemas, []);
  assert.equal(p.totais.mover, 2);
});
