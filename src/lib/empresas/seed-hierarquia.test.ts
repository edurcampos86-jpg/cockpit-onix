/**
 * Testes das funções PURAS de `seed-hierarquia.ts` — sem banco.
 *
 * Mesmo padrão de `hierarquia.test.ts`: `node:test` + `node:assert/strict`,
 * rodados por `npm test` (`tsx --test "src/**\/*.test.ts"`).
 *
 * O que está travado aqui é o CONTRATO da ação `seed-filhas`, e ele tem três
 * partes que só valem juntas:
 *
 *   1. cria só o que falta          → `criar` traz exatamente os ausentes
 *   2. é idempotente                → segunda passada não tem nada a criar
 *   3. não conserta pai em silêncio → pai errado vira `divergencias`, não `criar`
 *
 * A terceira é a que mais precisa de teste: um `upsert` distraído passaria nas
 * duas primeiras e reescreveria hierarquia de produção sem ninguém notar.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { RAIZ_DO_GRUPO, idsFilhasDaRaiz } from "./catalogo.ts";
import {
  EMPRESAS_DO_GRUPO,
  ONIX_CO,
  TODAS_AS_EMPRESAS,
  conferirRaiz,
  planejarSeedFilhas,
  type NoArvore,
} from "./seed-hierarquia.ts";
import { validarArvore } from "./hierarquia.ts";

/** Só a raiz no banco — o estado logo depois da ação padrão do endpoint. */
const SO_A_RAIZ: NoArvore[] = [{ id: "onix-co", nome: "Onix Co", parentId: null }];

/** Árvore completa: raiz + as 5, todas já penduradas. O alvo da operação. */
const COMPLETA: NoArvore[] = [
  ...SO_A_RAIZ,
  ...EMPRESAS_DO_GRUPO.map((e) => ({ id: e.id, nome: e.nome, parentId: e.parentId })),
];

// ── A lista canônica ───────────────────────────────────────────────────────

test("a lista canônica é a raiz + exatamente 5 filhas", () => {
  assert.equal(EMPRESAS_DO_GRUPO.length, 5);
  assert.equal(TODAS_AS_EMPRESAS.length, 6);
});

test("a raiz nasce sem pai e as 5 nascem penduradas nela", () => {
  // É a mudança da PR-B4: `parentId` faz parte da SEMENTE. Se alguém voltar a
  // criar as filhas soltas, a árvore fica plana de novo e só o reparenting a
  // conserta — que é exatamente a etapa que esta PR eliminou do bootstrap.
  assert.equal(ONIX_CO.parentId, null);
  for (const e of EMPRESAS_DO_GRUPO) {
    assert.equal(e.parentId, RAIZ_DO_GRUPO, `"${e.id}" não nasce pendurada na raiz`);
  }
});

test("a lista canônica bate com o catálogo, sem redigitação", () => {
  assert.deepEqual(
    [...EMPRESAS_DO_GRUPO.map((e) => e.id)].sort(),
    [...idsFilhasDaRaiz()].sort(),
  );
});

test("a árvore completa respeita a régua de 2 níveis", () => {
  // A mesma `validarArvore` que a rota roda sobre a árvore simulada antes de
  // escrever. Se a lista canônica ganhar uma neta um dia, quebra aqui primeiro.
  assert.deepEqual(validarArvore(COMPLETA), []);
});

// ── planejarSeedFilhas: banco só com a raiz ────────────────────────────────

test("com só a raiz no banco, planeja criar as 5 e nada mais", () => {
  const p = planejarSeedFilhas(SO_A_RAIZ);
  assert.deepEqual(
    p.criar.map((e) => e.id),
    EMPRESAS_DO_GRUPO.map((e) => e.id),
  );
  assert.deepEqual(p.jaExistiam, []);
  assert.deepEqual(p.divergencias, []);
  assert.equal(p.raizPresente, true);
});

test("a árvore simulada tem as 6 e passa na régua", () => {
  const p = planejarSeedFilhas(SO_A_RAIZ);
  assert.equal(p.arvoreSimulada.length, 6);
  assert.deepEqual(validarArvore(p.arvoreSimulada), []);
});

test("a simulação não altera a árvore recebida", () => {
  // O plano é PURO: quem chama precisa poder validar a simulação e ainda ter a
  // árvore original para comparar. Mutação aqui vazaria para a resposta do
  // endpoint, que devolve as duas.
  const entrada: NoArvore[] = [{ id: "onix-co", nome: "Onix Co", parentId: null }];
  const copia = structuredClone(entrada);
  planejarSeedFilhas(entrada);
  assert.deepEqual(entrada, copia);
});

// ── IDEMPOTÊNCIA ───────────────────────────────────────────────────────────

test("com a árvore já completa, não há nada a criar", () => {
  const p = planejarSeedFilhas(COMPLETA);
  assert.deepEqual(p.criar, []);
  assert.deepEqual(p.jaExistiam, EMPRESAS_DO_GRUPO.map((e) => e.id));
  assert.deepEqual(p.divergencias, []);
});

test("dez execuções seguidas deixam as mesmas 6 linhas", () => {
  // Simula o que o endpoint faz: planeja, aplica o `criar` sobre a árvore, e
  // repete. Se `planejarSeedFilhas` deixasse de reconhecer o que já existe, a
  // contagem cresceria a cada volta.
  let arvore: NoArvore[] = [...SO_A_RAIZ];
  for (let i = 0; i < 10; i++) {
    const p = planejarSeedFilhas(arvore);
    arvore = [
      ...arvore,
      ...p.criar.map((e) => ({ id: e.id, nome: e.nome, parentId: e.parentId })),
    ];
  }
  assert.equal(arvore.length, 6);
  assert.equal(new Set(arvore.map((e) => e.id)).size, 6);
  assert.deepEqual(validarArvore(arvore), []);
});

test("a partir da segunda passada não há mais escrita a fazer", () => {
  const primeira = planejarSeedFilhas(SO_A_RAIZ);
  const segunda = planejarSeedFilhas(primeira.arvoreSimulada);
  assert.equal(primeira.criar.length, 5);
  assert.equal(segunda.criar.length, 0);
});

// ── DIVERGÊNCIA DE parentId ────────────────────────────────────────────────

test("filha com pai errado vira divergência e NÃO entra em criar", () => {
  const comPaiErrado: NoArvore[] = [
    ...SO_A_RAIZ,
    { id: "corretora", nome: "Onix Corretora", parentId: "investimentos" },
  ];
  const p = planejarSeedFilhas(comPaiErrado);

  assert.deepEqual(p.divergencias, [
    { id: "corretora", esperado: "onix-co", atual: "investimentos" },
  ]);
  // O ponto do teste: a divergente fica FORA de `criar`. Se entrasse, o
  // `createMany` a engoliria no skipDuplicates — silêncio no lugar do aviso.
  assert.ok(!p.criar.some((e) => e.id === "corretora"));
  assert.ok(!p.jaExistiam.includes("corretora"));
});

test("filha que ficou como raiz solta também é divergência", () => {
  // O caso REAL: banco semeado antes da PR-B4, quando tudo nascia solto. O pai
  // não é "outro", é nenhum — e mesmo assim não se corrige aqui.
  const solta: NoArvore[] = [
    ...SO_A_RAIZ,
    { id: "tech", nome: "Onix Tech", parentId: null },
  ];
  const p = planejarSeedFilhas(solta);
  assert.deepEqual(p.divergencias, [{ id: "tech", esperado: "onix-co", atual: null }]);
  assert.equal(p.criar.length, 4);
});

test("divergência não impede as demais de serem criadas", () => {
  const misto: NoArvore[] = [
    ...SO_A_RAIZ,
    { id: "corretora", nome: "Onix Corretora", parentId: "investimentos" },
    { id: "tech", nome: "Onix Tech", parentId: "onix-co" },
  ];
  const p = planejarSeedFilhas(misto);
  assert.deepEqual(p.criar.map((e) => e.id).sort(), ["corporate", "imobiliaria", "investimentos"]);
  assert.deepEqual(p.jaExistiam, ["tech"]);
  assert.equal(p.divergencias.length, 1);
});

test("a divergente fica intacta na árvore simulada", () => {
  // A simulação só ACRESCENTA. Se ela "consertasse" o pai, a régua validaria
  // uma árvore que o banco nunca vai ter — e o 409 sairia (ou deixaria de
  // sair) pelo motivo errado.
  const comPaiErrado: NoArvore[] = [
    ...SO_A_RAIZ,
    { id: "corretora", nome: "Onix Corretora", parentId: "investimentos" },
  ];
  const p = planejarSeedFilhas(comPaiErrado);
  assert.equal(p.arvoreSimulada.find((e) => e.id === "corretora")?.parentId, "investimentos");
});

test("nome divergente no banco NÃO é tocado nem reportado", () => {
  // `skipDuplicates` preserva rename manual de propósito (ver o cabeçalho do
  // módulo). O plano tem de refletir isso: a linha entra em `jaExistiam`, não
  // em `criar` e não em `divergencias` — só o PAI é conferido.
  const renomeada: NoArvore[] = [
    ...SO_A_RAIZ,
    { id: "imobiliaria", nome: "Onix Imob (nome que o Eduardo mudou na mão)", parentId: "onix-co" },
  ];
  const p = planejarSeedFilhas(renomeada);
  assert.deepEqual(p.jaExistiam, ["imobiliaria"]);
  assert.deepEqual(p.divergencias, []);
});

// ── Pré-condição: a raiz ───────────────────────────────────────────────────

test("banco vazio: raizPresente é false e a rota tem como recusar", () => {
  // As filhas apontam para a raiz por FK; sem ela o INSERT falharia com erro de
  // driver. O plano detecta ANTES para a resposta poder ser instrutiva.
  const p = planejarSeedFilhas([]);
  assert.equal(p.raizPresente, false);
  assert.equal(p.criar.length, 5);
});

test("árvore com filhas mas sem raiz também é recusável", () => {
  const semRaiz: NoArvore[] = [{ id: "tech", nome: "Onix Tech", parentId: null }];
  assert.equal(planejarSeedFilhas(semRaiz).raizPresente, false);
});

// ── Guarda da régua ────────────────────────────────────────────────────────

test("lista que produziria neta é barrada pela régua sobre a simulada", () => {
  // Hoje impossível pela lista canônica; é a guarda para o dia em que ela
  // crescer. Passa uma lista FORJADA para provar que a rota recusaria: a
  // validação roda sobre `arvoreSimulada`, não sobre a lista.
  const arvore: NoArvore[] = [
    ...SO_A_RAIZ,
    { id: "investimentos", nome: "Onix Capital", parentId: "onix-co" },
  ];
  const p = planejarSeedFilhas(arvore, [
    { id: "neta", nome: "Neta", parentId: "investimentos" },
  ]);
  const problemas = validarArvore(p.arvoreSimulada);
  assert.equal(problemas.length, 1);
  assert.equal(problemas[0].id, "neta");
  assert.equal(problemas[0].motivo, "excede_profundidade");
});

// ── conferirRaiz ───────────────────────────────────────────────────────────
//
// É o campo `raiz` que GET e POST devolvem, e a única resposta que o endpoint
// dá para "a raiz entrou?". Os três campos existem porque as três perguntas
// são distintas — e ela NÃO corrige nada: `parentId` não-nulo na raiz é estado
// que nenhum código deste módulo produz (só chegaria por SQL manual), então é
// reportado. Consertar em silêncio esconderia como aconteceu.

test("raiz ausente: existe=false, e ehRaiz não vira true por descuido", () => {
  // O caso do banco vazio, e o mais importante de não confundir: `ehRaiz`
  // false aqui significa "não há raiz", não "há uma raiz malformada".
  const r = conferirRaiz([]);
  assert.deepEqual(r, { existe: false, ehRaiz: false, parentIdInesperado: null });
});

test("raiz ausente mesmo com outras empresas na tabela", () => {
  // Estado real de um banco em que alguém semeou as filhas antes da raiz.
  const r = conferirRaiz([{ id: "tech", nome: "Onix Tech", parentId: null }]);
  assert.equal(r.existe, false);
  assert.equal(r.parentIdInesperado, null);
});

test("raiz correta: existe, é raiz, e nada inesperado a reportar", () => {
  const r = conferirRaiz(SO_A_RAIZ);
  assert.deepEqual(r, { existe: true, ehRaiz: true, parentIdInesperado: null });
});

test("raiz correta continua correta na árvore completa", () => {
  // A presença das 5 filhas não muda a resposta sobre a raiz.
  assert.deepEqual(conferirRaiz(COMPLETA), {
    existe: true,
    ehRaiz: true,
    parentIdInesperado: null,
  });
});

test("raiz COM PAI é reportada, não corrigida", () => {
  // O estado ruim que só chega por SQL manual. `existe` segue true — ela está
  // lá —, mas `ehRaiz` é false e o pai indevido sai NOMEADO: sem isso, quem lê
  // a resposta sabe que algo está errado e não sabe o quê.
  const r = conferirRaiz([
    { id: "onix-co", nome: "Onix Co", parentId: "investimentos" },
    { id: "investimentos", nome: "Onix Capital", parentId: null },
  ]);
  assert.equal(r.existe, true);
  assert.equal(r.ehRaiz, false);
  assert.equal(r.parentIdInesperado, "investimentos");
});

test("raiz apontando para si mesma também cai em ehRaiz=false", () => {
  // Auto-referência é a forma mais fácil de o estado ruim entrar à mão, e a
  // que um `parentId !== null` genérico poderia deixar passar se alguém
  // trocasse a checagem por "tem pai diferente de si".
  const r = conferirRaiz([{ id: "onix-co", nome: "Onix Co", parentId: "onix-co" }]);
  assert.equal(r.ehRaiz, false);
  assert.equal(r.parentIdInesperado, "onix-co");
});

test("conferirRaiz não altera a árvore recebida", () => {
  // Ela é lida em resposta de rota; um efeito colateral aqui contaminaria o
  // que o chamador serializa em seguida.
  const entrada: NoArvore[] = [{ id: "onix-co", nome: "Onix Co", parentId: null }];
  const copia = structuredClone(entrada);
  conferirRaiz(entrada);
  assert.deepEqual(entrada, copia);
});

test("a raiz conferida é a do catálogo, não um literal deste teste", () => {
  // Se RAIZ_DO_GRUPO mudar, este teste tem de acompanhar sozinho — senão a
  // suíte continuaria verde afirmando algo sobre um id que não existe mais.
  const r = conferirRaiz([{ id: RAIZ_DO_GRUPO, nome: "qualquer", parentId: null }]);
  assert.equal(r.existe, true);
});
