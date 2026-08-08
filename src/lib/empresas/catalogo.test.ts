import assert from "node:assert/strict";
import { test } from "node:test";
import {
  EMPRESAS_DO_GRUPO,
  RAIZ_DO_GRUPO,
  divergencias,
  empresaDoGrupo,
  idsCadastradas,
  idsFilhasDaRaiz,
  idsNoHub,
} from "./catalogo";
import { NOS_ECOSSISTEMA } from "@/lib/hub-ecossistema/nos";

/* Este arquivo é o mecanismo inteiro do catálogo: sem ele, `catalogo.ts` seria
 * só uma quarta lista para divergir das outras três. O que trava a divergência
 * não é a declaração — é este teste comparando a declaração com quem a usa. */

test("o hub mostra EXATAMENTE quem o catálogo diz que aparece nele", () => {
  // Se um nó nascer em `nos.ts` sem passar por aqui, ele fica invisível para o
  // RBAC e para o seed sem ninguém notar — foi assim que `agro` e `contabil`
  // chegaram ao hub sem cadastro.
  assert.deepEqual([...NOS_ECOSSISTEMA.map((n) => n.id)].sort(), [...idsNoHub()].sort());
});

test("empresa fora do cadastro não pode ter rota — ela não existe no sistema", () => {
  // Implicação de mão única: `cadastrada: false` ⇒ `maturidade: "sem-rota"`.
  // O contrário é permitido (`educacao` está cadastrada e ainda não tem rota).
  //
  // Se alguém criar `src/app/empresas/agro/` e marcar "shell" sem cadastrar a
  // empresa, o gate de página (`podeVerEmpresa`) deixa TODO MUNDO entrar: ele
  // libera empresa ausente de `Empresa` de propósito (`gate-pagina.ts:74`).
  // Rota nova sem cadastro é rota sem RBAC. Este teste é o alarme.
  for (const no of NOS_ECOSSISTEMA) {
    const cat = empresaDoGrupo(no.id);
    assert.ok(cat, `nó "${no.id}" não está no catálogo`);
    if (!cat.cadastrada) {
      assert.equal(
        no.maturidade,
        "sem-rota",
        `"${no.id}" tem rota (${no.maturidade}) mas não está cadastrada — ` +
          "a página ficaria aberta a qualquer pessoa. Cadastre no catálogo e rode o seed.",
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

test("o reparenting nunca tenta pendurar a raiz nela mesma", () => {
  assert.ok(!idsFilhasDaRaiz().includes(RAIZ_DO_GRUPO));
  assert.equal(idsFilhasDaRaiz().length, idsCadastradas().length - 1);
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

test("as três caixas cobrem o catálogo inteiro e não se sobrepõem", () => {
  const { nosDois, soNoHub, soNoCadastro } = divergencias();
  const total = [...nosDois, ...soNoHub, ...soNoCadastro];
  // Empresa que não está nem no hub nem no cadastro não deveria existir aqui —
  // seria linha morta.
  assert.equal(total.length, EMPRESAS_DO_GRUPO.length);
  assert.equal(new Set(total).size, total.length);
});

test("o estado de HOJE, escrito por extenso", () => {
  // Fotografia proposital: quando alguém mudar uma presença no catálogo, este
  // teste falha e obriga a atualizar a foto — a mudança fica registrada no
  // diff em vez de passar despercebida.
  assert.deepEqual(divergencias(), {
    nosDois: ["investimentos", "corretora", "corporate", "imobiliaria", "tech", "educacao"],
    soNoHub: ["agro", "contabil"],
    soNoCadastro: ["onix-co", "planejamento"],
  });
});
