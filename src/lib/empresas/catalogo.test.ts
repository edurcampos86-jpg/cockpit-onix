import assert from "node:assert/strict";
import { test } from "node:test";
import {
  EMPRESAS_DO_GRUPO,
  RAIZ_DO_GRUPO,
  empresaDoGrupo,
  idsCadastradas,
  idsNoHub,
} from "./catalogo";
import { NOS_ECOSSISTEMA } from "@/lib/hub-ecossistema/nos";

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
  const ids = EMPRESAS_DO_GRUPO.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("toda divergência declarada carrega o motivo por escrito", () => {
  // A nota não é enfeite: é ela que impede a divergência de virar folclore
  // ("sempre foi assim"). Quem só está nos dois lados não precisa de nota.
  for (const e of EMPRESAS_DO_GRUPO) {
    if (e.cadastrada && e.noHub) continue;
    assert.ok(e.nota && e.nota.length > 0, `"${e.id}" diverge e não explica por quê`);
  }
});

test("nenhuma linha morta: empresa fora do hub E fora do cadastro não existe", () => {
  for (const e of EMPRESAS_DO_GRUPO) {
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
