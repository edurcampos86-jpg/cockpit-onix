import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CATALOGO_EMPRESAS,
  IDS_LEGADOS,
  RAIZ_DO_GRUPO,
  arvoreDoCatalogo,
  divergencias,
  empresaDoGrupo,
  filhosDe,
  idsCadastradas,
  idsFilhasDaRaiz,
  idsNoHub,
  idsPorTipo,
  idsTransversais,
} from "./catalogo";
import { validarArvoreCompleta } from "./hierarquia";
import { NOS_ECOSSISTEMA } from "@/lib/hub-ecossistema/nos";
import { ONIX_CO, TODAS_AS_EMPRESAS } from "./seed-hierarquia";

/* Este arquivo é o mecanismo inteiro do catálogo: sem ele, `catalogo.ts` seria
 * só uma terceira lista para divergir das outras duas. O que trava a
 * divergência não é a declaração — é este teste comparando a declaração com
 * quem a usa. */

// ── A ÁRVORE ──────────────────────────────────────────────────────────────

test("o catálogo é uma árvore válida — estrutura E papéis", () => {
  // A régua de `hierarquia.ts` aplicada à declaração, não só ao que chega no
  // banco. Um `parentId` digitado errado, um segundo `holding`, um
  // departamento com filho: tudo isso falha aqui antes de existir migration.
  assert.deepEqual(validarArvoreCompleta(arvoreDoCatalogo()), {
    estrutura: [],
    tipos: [],
    ok: true,
  });
});

test("são 20 nós: 1 holding, 6 empresas, 13 departamentos", () => {
  // Fotografia proposital da estrutura declarada pelo Eduardo. Mudar a
  // contagem é decisão; este teste obriga a decisão a aparecer no diff.
  assert.equal(CATALOGO_EMPRESAS.length, 20);
  assert.deepEqual(idsPorTipo("holding"), [RAIZ_DO_GRUPO]);
  assert.deepEqual(idsPorTipo("empresa"), [
    "investimentos",
    "educacao",
    "corretora",
    "imobiliaria",
    "contabil",
    "tech",
  ]);
  assert.equal(idsPorTipo("departamento").length, 13);
});

test("a árvore, escrita por extenso — pai a pai", () => {
  // O organograma inteiro num lugar legível. Qualquer remanejamento de nó
  // falha aqui, o que é o objetivo: mover um departamento de empresa é
  // decisão de negócio, não refactor.
  const arvore = Object.fromEntries(
    CATALOGO_EMPRESAS.filter((e) => filhosDe(e.id).length > 0).map((e) => [
      e.id,
      filhosDe(e.id).map((f) => f.id),
    ]),
  );
  assert.deepEqual(arvore, {
    "onix-co": [
      "onix-co-expansao",
      "onix-co-marketing",
      "investimentos",
      "educacao",
      "corretora",
      "imobiliaria",
      "contabil",
      "tech",
    ],
    investimentos: ["agro", "investimentos-qualidade", "investimentos-investimentos"],
    educacao: ["educacao-qualidade"],
    corretora: [
      "planejamento",
      "corretora-corretora",
      "corporate",
      "corretora-qualidade",
    ],
    imobiliaria: ["imobiliaria-qualidade"],
    contabil: ["contabil-qualidade"],
    tech: ["tech-qualidade"],
  });
});

test("a holding é a raiz e NÃO é nó da órbita", () => {
  // No hub ela é o núcleo "Onix", não um dos 8 satélites.
  const raiz = empresaDoGrupo(RAIZ_DO_GRUPO);
  assert.ok(raiz);
  assert.equal(raiz.tipo, "holding");
  assert.equal(raiz.parentId, null);
  assert.equal(raiz.noHub, false);
});

test("só 8 nós penduram direto na holding", () => {
  assert.deepEqual(idsFilhasDaRaiz(), [
    "onix-co-expansao",
    "onix-co-marketing",
    "investimentos",
    "educacao",
    "corretora",
    "imobiliaria",
    "contabil",
    "tech",
  ]);
  assert.ok(!idsFilhasDaRaiz().includes(RAIZ_DO_GRUPO));
});

// ── IDS ───────────────────────────────────────────────────────────────────

test("id não se repete no catálogo", () => {
  const ids = CATALOGO_EMPRESAS.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("rótulo REPETE de propósito, e sempre com ids distintos", () => {
  // O contrário do teste de id: aqui a repetição é a regra declarada pelo
  // Eduardo, não um defeito. Travá-la por escrito impede que alguém "conserte"
  // renomeando uma das Qualidades.
  const porNome = new Map<string, string[]>();
  for (const e of CATALOGO_EMPRESAS) {
    porNome.set(e.nome, [...(porNome.get(e.nome) ?? []), e.id]);
  }
  const repetidos = Object.fromEntries(
    [...porNome].filter(([, ids]) => ids.length > 1),
  );
  assert.deepEqual(repetidos, {
    "Qualidade e Pós-venda": [
      "investimentos-qualidade",
      "educacao-qualidade",
      "corretora-qualidade",
      "imobiliaria-qualidade",
      "contabil-qualidade",
      "tech-qualidade",
    ],
    "Onix Corretora": ["corretora", "corretora-corretora"],
  });
});

test("departamento fora da convenção `<pai>-<apelido>` está em IDS_LEGADOS", () => {
  // A convenção não é estética: o prefixo é o que deixa ler, do id, onde o nó
  // mora. Os três legados fogem dela porque renomear id com linha em produção
  // criaria órfão — e é por isso que a exceção é uma LISTA, não uma tolerância.
  const foraDaConvencao = CATALOGO_EMPRESAS.filter(
    (e) => e.tipo === "departamento" && !e.id.startsWith(`${e.parentId}-`),
  ).map((e) => e.id);
  assert.deepEqual(foraDaConvencao.sort(), [...IDS_LEGADOS].sort());
});

test("todo id legado carrega a nota que explica por que ele fica", () => {
  for (const id of IDS_LEGADOS) {
    const e = empresaDoGrupo(id);
    assert.ok(e, `"${id}" está em IDS_LEGADOS e não está no catálogo`);
    assert.ok(e.nota && e.nota.length > 0, `"${id}" é legado e não explica por quê`);
  }
});

// ── TRANSVERSAL ───────────────────────────────────────────────────────────

test("as 6 Qualidades são transversais — uma por empresa, nenhuma sobrando", () => {
  const transversais = idsTransversais();
  assert.equal(transversais.length, 6);

  for (const id of transversais) {
    const e = empresaDoGrupo(id);
    assert.ok(e);
    assert.equal(e.nome, "Qualidade e Pós-venda", `"${id}" é transversal com outro rótulo`);
    assert.equal(e.tipo, "departamento");
  }

  // Uma por empresa, e a holding sem nenhuma: é a estrutura declarada.
  const paisDasQualidades = transversais.map((id) => empresaDoGrupo(id)?.parentId);
  assert.deepEqual([...paisDasQualidades].sort(), [...idsPorTipo("empresa")].sort());
});

test("toda ocorrência de 'Qualidade e Pós-venda' está marcada como transversal", () => {
  // A implicação inversa da anterior. Sem ela, uma sétima Qualidade poderia
  // nascer sem a flag e sumir da consulta cruzada sem ninguém notar.
  for (const e of CATALOGO_EMPRESAS) {
    if (e.nome !== "Qualidade e Pós-venda") continue;
    assert.equal(e.transversal, true, `"${e.id}" é Qualidade e não está marcada`);
  }
});

// ── HUB ───────────────────────────────────────────────────────────────────

test("o hub mostra EXATAMENTE quem o catálogo diz que aparece nele", () => {
  // Se um nó nascer em `nos.ts` sem passar por aqui, ele fica invisível para o
  // seed sem ninguém notar — foi assim que `agro` e `contabil` chegaram ao hub
  // sem cadastro.
  assert.deepEqual([...NOS_ECOSSISTEMA.map((n) => n.id)].sort(), [...idsNoHub()].sort());
});

test("o hub e o catálogo concordam no RÓTULO, não só no id", () => {
  // A divergência que sobreviveu até esta PR: `nos.ts` dizia "Onix
  // Educacional" e o catálogo, "Onix Educação". Id igual, nome diferente —
  // invisível para o teste de ids.
  for (const no of NOS_ECOSSISTEMA) {
    assert.equal(no.nome, empresaDoGrupo(no.id)?.nome, `rótulo de "${no.id}" divergiu`);
  }
});

test("todo nó do hub existe no cadastro — ninguém orbita sem linha em Empresa", () => {
  // A propriedade que o eixo `cadastrada` existia para monitorar. Ela deixou
  // de ser MONITORADA e passou a ser GARANTIDA: todo nó do catálogo é semeado,
  // e o hub só pode mostrar quem está no catálogo (teste acima).
  const cadastradas = new Set(idsCadastradas());
  for (const no of NOS_ECOSSISTEMA) {
    assert.ok(cadastradas.has(no.id), `"${no.id}" orbita o hub e não é semeado`);
  }
});

test("departamento pode orbitar o hub, e quando orbita explica por quê", () => {
  // `agro` e `corporate` continuam na órbita mesmo tendo deixado de ser
  // empresa: orbitar é decisão VISUAL, não societária. Como a leitura óbvia
  // do hub é "estas são as empresas", os dois carregam nota.
  const departamentosNoHub = CATALOGO_EMPRESAS.filter(
    (e) => e.noHub && e.tipo === "departamento",
  );
  assert.deepEqual(departamentosNoHub.map((e) => e.id), ["agro", "corporate"]);
  for (const e of departamentosNoHub) {
    assert.ok(e.nota && e.nota.length > 0, `"${e.id}" orbita sendo departamento e não explica`);
  }
});

test("as quatro caixas cobrem o catálogo inteiro e não se sobrepõem", () => {
  const { nosDois, soNoHub, soNoCadastro, foraDosDois } = divergencias();
  const total = [...nosDois, ...soNoHub, ...soNoCadastro, ...foraDosDois];
  assert.equal(total.length, CATALOGO_EMPRESAS.length);
  assert.equal(new Set(total).size, total.length);
});

test("as duas caixas de divergência ficaram VAZIAS — e isso é o resultado da PR", () => {
  // `soNoHub` (anunciada sem cadastro) e `foraDosDois` eram os estados que o
  // eixo `cadastrada` registrava. Com todo nó da estrutura virando linha em
  // `Empresa`, os dois deixaram de ser alcançáveis. As caixas continuam
  // declaradas porque a auditoria de permissões as lê; este teste é o que
  // impede alguém reintroduzir o estado sem perceber.
  const d = divergencias();
  assert.deepEqual(d.soNoHub, []);
  assert.deepEqual(d.foraDosDois, []);
  assert.equal(d.nosDois.length, 8);
  assert.equal(d.soNoCadastro.length, 12);
});

// ── O SEED DERIVA DAQUI ───────────────────────────────────────────────────

/* `seed-hierarquia.ts` (o módulo que o script de terminal e
 * `POST /api/empresas/hierarquia` compartilham) DERIVA daqui. Estes testes são
 * o que impede a derivação de silenciosamente deixar de bater — foi exatamente
 * assim que seed e hub divergiram antes de o catálogo existir. */

test("o seed semeia EXATAMENTE os 20 nós do catálogo", () => {
  assert.deepEqual([...TODAS_AS_EMPRESAS.map((e) => e.id)].sort(), [...idsCadastradas()].sort());
});

test("a raiz do seed é a holding do catálogo, com o mesmo nome", () => {
  const raiz = empresaDoGrupo(RAIZ_DO_GRUPO);
  assert.ok(raiz);
  assert.equal(ONIX_CO.id, raiz.id);
  assert.equal(ONIX_CO.nome, raiz.nome);
  assert.equal(ONIX_CO.tipo, "holding");
});

test("a raiz não se repete dentro de TODAS_AS_EMPRESAS", () => {
  // `TODAS_AS_EMPRESAS = [ONIX_CO, ...NOS_ABAIXO_DA_HOLDING]`: se o filtro que
  // tira a raiz da segunda lista quebrar, `createMany` receberia a PK duplicada.
  const ids = TODAS_AS_EMPRESAS.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(ids.filter((id) => id === RAIZ_DO_GRUPO).length, 1);
});

test("os nomes, tipos e pais do seed vêm do catálogo, sem redigitação", () => {
  for (const s of TODAS_AS_EMPRESAS) {
    const cat = empresaDoGrupo(s.id);
    assert.ok(cat, `"${s.id}" foi semeado e não está no catálogo`);
    assert.equal(s.nome, cat.nome, `nome de "${s.id}" divergiu`);
    assert.equal(s.tipo, cat.tipo, `tipo de "${s.id}" divergiu`);
    assert.equal(s.parentId, cat.parentId, `pai de "${s.id}" divergiu`);
    assert.equal(s.transversal, cat.transversal === true, `transversal de "${s.id}" divergiu`);
  }
});
