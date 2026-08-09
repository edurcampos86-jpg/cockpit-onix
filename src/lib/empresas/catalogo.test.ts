import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CATALOGO_EMPRESAS,
  RAIZ_DO_GRUPO,
  empresaDoGrupo,
  idsCadastradas,
  idsNoHub,
} from "./catalogo";
import { NOS_ECOSSISTEMA } from "@/lib/hub-ecossistema/nos";
import { ONIX_CO, TODAS_AS_EMPRESAS } from "./seed-hierarquia";

/* Este arquivo é o mecanismo inteiro do catálogo: sem ele, `catalogo.ts` seria
 * só uma terceira lista para divergir das outras duas. O que trava a
 * divergência não é a declaração — é este teste comparando a declaração com
 * quem a usa. */

test("o hub mostra EXATAMENTE quem o catálogo diz que aparece nele", () => {
  // Se um nó nascer em `nos.ts` sem passar por aqui, ele fica invisível para o
  // seed sem ninguém notar — foi assim que `agro` e `contabil` chegaram ao hub
  // sem cadastro.
  assert.deepEqual([...NOS_ECOSSISTEMA.map((n) => n.id)].sort(), [...idsNoHub()].sort());
});

test("empresa fora do cadastro não pode ter rota — ela não existe no sistema", () => {
  // Implicação de mão única: `cadastrada: false` ⇒ `maturidade: "sem-rota"`.
  // O contrário é permitido (`educacao` está cadastrada e ainda não tem rota).
  //
  // O que este teste protege HOJE: `maturidade` é o que decide se o nó promete
  // um destino ao usuário. Prometer rota para uma empresa que não existe nem
  // como cadastro é promessa que o 404 desmente no clique.
  //
  // O que ele protege DEPOIS: qualquer regra pendurada em `Empresa` — a começar
  // pelo RBAC por empresa, em PR à parte — trata "não cadastrada" como ausência,
  // não como negação. Rota que nasce sem cadastro nasce fora dessa régua.
  for (const no of NOS_ECOSSISTEMA) {
    const cat = empresaDoGrupo(no.id);
    assert.ok(cat, `nó "${no.id}" não está no catálogo`);
    if (!cat.cadastrada) {
      assert.equal(
        no.maturidade,
        "sem-rota",
        `"${no.id}" promete rota (${no.maturidade}) mas não está cadastrada — ` +
          "cadastre no catálogo e rode o seed antes de criar a página.",
      );
    }
  }
});

test("a raiz está cadastrada e NÃO é nó da órbita", () => {
  // No hub ela é o núcleo "Onix", não um dos 8 satélites.
  const raiz = empresaDoGrupo(RAIZ_DO_GRUPO);
  assert.ok(raiz);
  assert.equal(raiz.cadastrada, true);
  assert.equal(raiz.noHub, false);
});

test("id não se repete no catálogo", () => {
  const ids = CATALOGO_EMPRESAS.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("toda divergência declarada carrega o motivo por escrito", () => {
  // A nota não é enfeite: é ela que impede a divergência de virar folclore
  // ("sempre foi assim"). Quem só está nos dois lados não precisa de nota.
  for (const e of CATALOGO_EMPRESAS) {
    if (e.cadastrada && e.noHub) continue;
    assert.ok(e.nota && e.nota.length > 0, `"${e.id}" diverge e não explica por quê`);
  }
});

test("nenhuma linha morta: empresa fora do hub E fora do cadastro não existe", () => {
  for (const e of CATALOGO_EMPRESAS) {
    assert.ok(e.cadastrada || e.noHub, `"${e.id}" não aparece em lugar nenhum — remova a linha`);
  }
});

test("o estado de HOJE, escrito por extenso", () => {
  // Fotografia proposital: quando alguém mudar uma presença no catálogo, este
  // teste falha e obriga a atualizar a foto — a mudança fica registrada no
  // diff em vez de passar despercebida.
  assert.deepEqual(idsCadastradas(), [
    "onix-co",
    "investimentos",
    "corretora",
    "corporate",
    "imobiliaria",
    "tech",
    "educacao",
    "planejamento",
  ]);
  assert.deepEqual(idsNoHub(), [
    "investimentos",
    "corretora",
    "corporate",
    "imobiliaria",
    "tech",
    "educacao",
    "agro",
    "contabil",
  ]);
});

/* ── O outro lado do catálogo: quem é semeado ─────────────────────────────
 *
 * `seed-hierarquia.ts` (o módulo que o script de terminal e
 * `POST /api/empresas/hierarquia` compartilham) DERIVA daqui. Estes testes são
 * o que impede a derivação de silenciosamente deixar de bater — foi exatamente
 * assim que seed e hub divergiram antes de o catálogo existir. */

test("o seed semeia EXATAMENTE quem o catálogo diz que é cadastrada", () => {
  assert.deepEqual([...TODAS_AS_EMPRESAS.map((e) => e.id)].sort(), [...idsCadastradas()].sort());
});

test("a raiz do seed é a raiz do catálogo, com o mesmo nome", () => {
  const raiz = empresaDoGrupo(RAIZ_DO_GRUPO);
  assert.ok(raiz);
  assert.equal(ONIX_CO.id, raiz.id);
  assert.equal(ONIX_CO.nome, raiz.nome);
});

test("a raiz não se repete dentro de TODAS_AS_EMPRESAS", () => {
  // `TODAS_AS_EMPRESAS = [ONIX_CO, ...EMPRESAS_DO_GRUPO]`: se o filtro que tira
  // a raiz da segunda lista quebrar, `createMany` receberia a PK duplicada.
  const ids = TODAS_AS_EMPRESAS.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(ids.filter((id) => id === RAIZ_DO_GRUPO).length, 1);
});

test("empresa anunciada e não cadastrada NUNCA é semeada", () => {
  // `agro` e `contabil` orbitam o hub sem existir como operação. Semeá-las
  // criaria empresa que ninguém pode abrir — e passaria a valer como cadastro
  // para qualquer regra pendurada em `Empresa`.
  const semeados = new Set(TODAS_AS_EMPRESAS.map((e) => e.id));
  for (const e of CATALOGO_EMPRESAS.filter((x) => !x.cadastrada)) {
    assert.ok(!semeados.has(e.id), `"${e.id}" não é cadastrada e entrou no seed`);
  }
});

test("os nomes do seed vêm do catálogo, sem redigitação", () => {
  for (const s of TODAS_AS_EMPRESAS) {
    assert.equal(s.nome, empresaDoGrupo(s.id)?.nome, `nome de "${s.id}" divergiu`);
  }
});
