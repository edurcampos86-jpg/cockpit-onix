/**
 * Testes das funções PURAS de `seed-hierarquia.ts` — sem banco.
 *
 * Mesmo padrão de `hierarquia.test.ts`: `node:test` + `node:assert/strict`,
 * rodados por `npm test` (`tsx --test "src/**\/*.test.ts"`).
 *
 * O que está travado aqui é o CONTRATO da ação `seed-filhas`, e ele tem quatro
 * partes que só valem juntas:
 *
 *   1. cria só o que falta          → `criar` traz exatamente os ausentes
 *   2. é idempotente                → segunda passada não tem nada a criar
 *   3. não conserta pai em silêncio → pai errado vira `divergencias`, não `criar`
 *   4. insere na ordem da FK        → nenhum filho entra antes do pai
 *
 * A terceira é a que mais precisa de teste: um `upsert` distraído passaria nas
 * outras três e reescreveria hierarquia de produção sem ninguém notar. A
 * quarta nasceu com os 3 níveis — com 2, "raízes primeiro" era ordem
 * suficiente e não havia o que calcular.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { CATALOGO_EMPRESAS, RAIZ_DO_GRUPO, idsFilhasDaRaiz } from "./catalogo.ts";
import {
  NOS_ABAIXO_DA_HOLDING,
  ONIX_CO,
  TODAS_AS_EMPRESAS,
  conferirRaiz,
  lotesPorProfundidade,
  planejarSeedFilhas,
  type EmpresaSemente,
  type NoArvore,
} from "./seed-hierarquia.ts";
import { validarArvoreCompleta } from "./hierarquia.ts";

/** Um nó do catálogo no formato "linha do banco". Fixture sem redigitação. */
function linha(id: string): NoArvore {
  const e = CATALOGO_EMPRESAS.find((x) => x.id === id);
  assert.ok(e, `"${id}" não está no catálogo — o fixture envelheceu`);
  return {
    id: e.id,
    nome: e.nome,
    tipo: e.tipo,
    transversal: e.transversal === true,
    parentId: e.parentId,
  };
}

/** Só a holding no banco — o estado logo depois da ação padrão do endpoint. */
const SO_A_RAIZ: NoArvore[] = [linha(RAIZ_DO_GRUPO)];

/** Árvore completa: os 20 nós, cada um já pendurado. O alvo da operação. */
const COMPLETA: NoArvore[] = CATALOGO_EMPRESAS.map((e) => linha(e.id));

// ── A lista canônica ───────────────────────────────────────────────────────

test("a lista canônica é a holding + exatamente 19 nós abaixo dela", () => {
  assert.equal(NOS_ABAIXO_DA_HOLDING.length, 19);
  assert.equal(TODAS_AS_EMPRESAS.length, 20);
});

test("a holding nasce sem pai; todo o resto nasce pendurado em alguém", () => {
  // É a mudança da PR-B4: `parentId` faz parte da SEMENTE. Se alguém voltar a
  // criar os nós soltos, a árvore fica plana de novo e só o reparenting a
  // conserta — que é exatamente a etapa que aquela PR eliminou do bootstrap.
  assert.equal(ONIX_CO.parentId, null);
  assert.equal(ONIX_CO.tipo, "holding");
  for (const e of NOS_ABAIXO_DA_HOLDING) {
    assert.ok(e.parentId !== null, `"${e.id}" nasce solto`);
  }
});

test("só 8 penduram DIRETO na holding — o resto pendura nas empresas", () => {
  // A diferença que os 3 níveis introduzem: `NOS_ABAIXO_DA_HOLDING` (19) e
  // `idsFilhasDaRaiz()` (8) deixaram de ser a mesma lista. Confundir as duas
  // faria o reparenting arrastar as Qualidades para a raiz.
  const direto = NOS_ABAIXO_DA_HOLDING.filter((e) => e.parentId === RAIZ_DO_GRUPO);
  assert.equal(direto.length, 8);
  assert.deepEqual([...direto.map((e) => e.id)].sort(), [...idsFilhasDaRaiz()].sort());
});

test("a semente carrega tipo e transversal, sem redigitação", () => {
  for (const s of NOS_ABAIXO_DA_HOLDING) {
    const cat = CATALOGO_EMPRESAS.find((e) => e.id === s.id);
    assert.ok(cat);
    assert.equal(s.tipo, cat.tipo, `tipo de "${s.id}" divergiu`);
    assert.equal(s.transversal, cat.transversal === true, `transversal de "${s.id}" divergiu`);
  }
});

test("a árvore completa respeita a régua de 3 níveis E os papéis", () => {
  // A mesma validação que a rota roda sobre a árvore simulada antes de
  // escrever. Se o catálogo ganhar um bisneto ou um departamento com filho,
  // quebra aqui primeiro.
  assert.deepEqual(validarArvoreCompleta(COMPLETA), { estrutura: [], tipos: [], ok: true });
});

// ── lotesPorProfundidade: a ordem que a FK exige ───────────────────────────

test("a semeadura completa sai em 3 lotes: holding, empresas, departamentos", () => {
  const lotes = lotesPorProfundidade(TODAS_AS_EMPRESAS);
  assert.ok(lotes);
  assert.equal(lotes.length, 3);
  assert.deepEqual(lotes[0].map((e) => e.id), [RAIZ_DO_GRUPO]);
  assert.equal(lotes[1].length, 8); // 6 empresas + os 2 departamentos da holding
  assert.equal(lotes[2].length, 11); // os departamentos das empresas
});

test("nenhum nó entra antes do pai", () => {
  // A propriedade que a FK exige, conferida sobre a ordem REAL de inserção em
  // vez de sobre a contagem de lotes: para cada semente, o pai ou já saiu num
  // lote anterior, ou não está nesta chamada (logo já está no banco).
  const lotes = lotesPorProfundidade(TODAS_AS_EMPRESAS);
  assert.ok(lotes);
  const pedidos = new Set(TODAS_AS_EMPRESAS.map((e) => e.id));
  const jaSairam = new Set<string>();
  for (const lote of lotes) {
    for (const s of lote) {
      if (s.parentId !== null && pedidos.has(s.parentId)) {
        assert.ok(jaSairam.has(s.parentId), `"${s.id}" sairia antes de "${s.parentId}"`);
      }
    }
    for (const s of lote) jaSairam.add(s.id);
  }
});

test("pai fora da chamada vai no primeiro lote — é o caso do seed-filhas", () => {
  // Semear só os departamentos, com as empresas já no banco: nenhum deles tem
  // o pai nesta chamada, então todos cabem num lote só. Quem protege é a FK.
  const soDepartamentos = NOS_ABAIXO_DA_HOLDING.filter((e) => e.tipo === "departamento");
  const lotes = lotesPorProfundidade(soDepartamentos);
  assert.ok(lotes);
  assert.equal(lotes.length, 1);
  assert.equal(lotes[0].length, soDepartamentos.length);
});

test("ciclo entre sementes devolve null em vez de laço infinito", () => {
  const ciclo: EmpresaSemente[] = [
    { id: "a", nome: "A", tipo: "departamento", transversal: false, parentId: "b" },
    { id: "b", nome: "B", tipo: "departamento", transversal: false, parentId: "a" },
  ];
  assert.equal(lotesPorProfundidade(ciclo), null);
});

// ── planejarSeedFilhas: banco só com a holding ─────────────────────────────

test("com só a holding no banco, planeja criar os 19 e nada mais", () => {
  const p = planejarSeedFilhas(SO_A_RAIZ);
  assert.deepEqual(
    p.criar.map((e) => e.id),
    NOS_ABAIXO_DA_HOLDING.map((e) => e.id),
  );
  assert.deepEqual(p.jaExistiam, []);
  assert.deepEqual(p.divergencias, []);
  assert.equal(p.raizPresente, true);
});

test("a árvore simulada tem os 20 e passa na régua", () => {
  const p = planejarSeedFilhas(SO_A_RAIZ);
  assert.equal(p.arvoreSimulada.length, 20);
  assert.equal(validarArvoreCompleta(p.arvoreSimulada).ok, true);
});

test("a simulação não altera a árvore recebida", () => {
  // O plano é PURO: quem chama precisa poder validar a simulação e ainda ter a
  // árvore original para comparar. Mutação aqui vazaria para a resposta do
  // endpoint, que devolve as duas.
  const entrada: NoArvore[] = [linha(RAIZ_DO_GRUPO)];
  const copia = structuredClone(entrada);
  planejarSeedFilhas(entrada);
  assert.deepEqual(entrada, copia);
});

// ── IDEMPOTÊNCIA ───────────────────────────────────────────────────────────

test("com a árvore já completa, não há nada a criar", () => {
  const p = planejarSeedFilhas(COMPLETA);
  assert.deepEqual(p.criar, []);
  assert.deepEqual(p.jaExistiam, NOS_ABAIXO_DA_HOLDING.map((e) => e.id));
  assert.deepEqual(p.divergencias, []);
});

test("dez execuções seguidas deixam as mesmas 20 linhas", () => {
  // Simula o que o endpoint faz: planeja, aplica o `criar` sobre a árvore, e
  // repete. Se `planejarSeedFilhas` deixasse de reconhecer o que já existe, a
  // contagem cresceria a cada volta.
  let arvore: NoArvore[] = [...SO_A_RAIZ];
  for (let i = 0; i < 10; i++) {
    const p = planejarSeedFilhas(arvore);
    arvore = p.arvoreSimulada;
  }
  assert.equal(arvore.length, 20);
  assert.equal(new Set(arvore.map((e) => e.id)).size, 20);
  assert.equal(validarArvoreCompleta(arvore).ok, true);
});

test("a partir da segunda passada não há mais escrita a fazer", () => {
  const primeira = planejarSeedFilhas(SO_A_RAIZ);
  const segunda = planejarSeedFilhas(primeira.arvoreSimulada);
  assert.equal(primeira.criar.length, 19);
  assert.equal(segunda.criar.length, 0);
});

// ── DIVERGÊNCIA DE parentId ────────────────────────────────────────────────

test("nó com pai errado vira divergência e NÃO entra em criar", () => {
  const comPaiErrado: NoArvore[] = [
    ...SO_A_RAIZ,
    { ...linha("corretora"), parentId: "investimentos" },
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

test("nó que ficou como raiz solta também é divergência", () => {
  // O caso REAL: banco semeado antes da PR-B4, quando tudo nascia solto. O pai
  // não é "outro", é nenhum — e mesmo assim não se corrige aqui.
  const solta: NoArvore[] = [...SO_A_RAIZ, { ...linha("tech"), parentId: null }];
  const p = planejarSeedFilhas(solta);
  assert.deepEqual(p.divergencias, [{ id: "tech", esperado: "onix-co", atual: null }]);
  assert.equal(p.criar.length, 18);
});

test("divergência não impede os demais de serem criados", () => {
  const misto: NoArvore[] = [
    ...SO_A_RAIZ,
    { ...linha("corretora"), parentId: "investimentos" },
    linha("tech"),
  ];
  const p = planejarSeedFilhas(misto);
  assert.equal(p.criar.length, 17);
  assert.deepEqual(p.jaExistiam, ["tech"]);
  assert.equal(p.divergencias.length, 1);
  assert.ok(!p.criar.some((e) => e.id === "corretora" || e.id === "tech"));
});

test("departamento com pai errado é divergência igual à empresa", () => {
  // Com 3 níveis a divergência deixou de ser só "não está na raiz": uma
  // Qualidade pendurada na empresa ERRADA é o mesmo defeito, e teria passado
  // despercebida numa conferência que só olhasse `parentId === "onix-co"`.
  const trocada: NoArvore[] = [
    ...SO_A_RAIZ,
    { ...linha("tech-qualidade"), parentId: "contabil" },
  ];
  const p = planejarSeedFilhas(trocada);
  assert.deepEqual(p.divergencias, [
    { id: "tech-qualidade", esperado: "tech", atual: "contabil" },
  ]);
});

test("a divergente fica intacta na árvore simulada", () => {
  // A simulação só ACRESCENTA. Se ela "consertasse" o pai, a régua validaria
  // uma árvore que o banco nunca vai ter — e o 409 sairia (ou deixaria de
  // sair) pelo motivo errado.
  const comPaiErrado: NoArvore[] = [
    ...SO_A_RAIZ,
    { ...linha("corretora"), parentId: "investimentos" },
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
    { ...linha("imobiliaria"), nome: "Onix Imob (nome que o Eduardo mudou na mão)" },
  ];
  const p = planejarSeedFilhas(renomeada);
  assert.deepEqual(p.jaExistiam, ["imobiliaria"]);
  assert.deepEqual(p.divergencias, []);
});

// ── Pré-condição: a holding ────────────────────────────────────────────────

test("banco vazio: raizPresente é false e a rota tem como recusar", () => {
  // Os nós apontam para a holding por FK; sem ela o INSERT falharia com erro de
  // driver. O plano detecta ANTES para a resposta poder ser instrutiva.
  const p = planejarSeedFilhas([]);
  assert.equal(p.raizPresente, false);
  assert.equal(p.criar.length, 19);
});

test("árvore com nós mas sem holding também é recusável", () => {
  const semRaiz: NoArvore[] = [{ ...linha("tech"), parentId: null }];
  assert.equal(planejarSeedFilhas(semRaiz).raizPresente, false);
});

// ── Guarda da régua ────────────────────────────────────────────────────────

test("lista que produziria bisneto é barrada pela régua sobre a simulada", () => {
  // Hoje impossível pela lista canônica; é a guarda para o dia em que ela
  // crescer. Passa uma lista FORJADA para provar que a rota recusaria: a
  // validação roda sobre `arvoreSimulada`, não sobre a lista.
  const arvore: NoArvore[] = [...SO_A_RAIZ, linha("investimentos"), linha("agro")];
  const p = planejarSeedFilhas(arvore, [
    { id: "bisneta", nome: "Bisneta", tipo: "departamento", transversal: false, parentId: "agro" },
  ]);
  const { estrutura, tipos } = validarArvoreCompleta(p.arvoreSimulada);
  assert.equal(estrutura.length, 1);
  assert.equal(estrutura[0].id, "bisneta");
  assert.equal(estrutura[0].motivo, "excede_profundidade");
  // E a régua de PAPÉIS pega o mesmo defeito por outro lado — departamento
  // dentro de departamento —, o que é o ponto de ter as duas: quando o teto
  // subir de novo, esta continua valendo.
  assert.deepEqual(
    tipos.map((t) => t.motivo).sort(),
    ["departamento_com_filho", "pai_departamento"],
  );
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
