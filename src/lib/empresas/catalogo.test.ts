import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  CATALOGO_EMPRESAS,
  IDS_LEGADOS,
  RAIZ_DO_GRUPO,
  arvoreDoCatalogo,
  caminhoDe,
  caminhoNoCatalogo,
  rotuloComCaminho,
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

test("são 48 nós: 1 holding, 6 empresas, 41 departamentos", () => {
  // Fotografia proposital da estrutura declarada pelo Eduardo. Mudar a
  // contagem é decisão; este teste obriga a decisão a aparecer no diff.
  assert.equal(CATALOGO_EMPRESAS.length, 48);
  assert.deepEqual(idsPorTipo("holding"), [RAIZ_DO_GRUPO]);
  assert.deepEqual(idsPorTipo("empresa"), [
    "investimentos",
    "educacao",
    "corretora",
    "imobiliaria",
    "contabil",
    "tech",
  ]);
  assert.equal(idsPorTipo("departamento").length, 41);
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
      // Os quatro consolidadores: mesmo rótulo das transversais das empresas,
      // papel oposto — aqui se SOMA o que lá se FAZ.
      "onix-co-adm",
      "onix-co-juridico",
      "onix-co-compliance",
      "onix-co-clientes",
      "investimentos",
      "educacao",
      "corretora",
      "imobiliaria",
      "contabil",
      "tech",
    ],
    // Cada empresa carrega as MESMAS 5 transversais. O que varia é o que vem
    // antes delas — os departamentos próprios daquela casa.
    investimentos: [
      "agro",
      "investimentos-qualidade",
      "investimentos-investimentos",
      "investimentos-adm", "investimentos-juridico", "investimentos-compliance", "investimentos-backoffice",
    ],
    educacao: ["educacao-qualidade", "educacao-adm", "educacao-juridico", "educacao-compliance", "educacao-backoffice"],
    corretora: [
      "planejamento",
      "corretora-corretora",
      "corporate",
      "corretora-qualidade",
      "corretora-adm", "corretora-juridico", "corretora-compliance", "corretora-backoffice",
    ],
    imobiliaria: ["imobiliaria-qualidade", "imobiliaria-adm", "imobiliaria-juridico", "imobiliaria-compliance", "imobiliaria-backoffice"],
    contabil: ["contabil-qualidade", "contabil-adm", "contabil-juridico", "contabil-compliance", "contabil-backoffice"],
    tech: ["tech-qualidade", "tech-adm", "tech-juridico", "tech-compliance", "tech-backoffice"],
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

test("12 nós penduram direto na holding: 2 próprios, 4 consolidadores, 6 empresas", () => {
  assert.deepEqual(idsFilhasDaRaiz(), [
    "onix-co-expansao",
    "onix-co-marketing",
    "onix-co-adm",
    "onix-co-juridico",
    "onix-co-compliance",
    "onix-co-clientes",
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
    // Os 4 consolidadores da holding entram na frente da ocorrência das
    // empresas: mesmo rótulo, papel oposto. É a repetição mais importante de
    // travar, porque é a que parece erro para quem chega agora.
    "ADM/Financeiro": ["onix-co-adm", "investimentos-adm", "educacao-adm", "corretora-adm", "imobiliaria-adm", "contabil-adm", "tech-adm"],
    "Jurídico": ["onix-co-juridico", "investimentos-juridico", "educacao-juridico", "corretora-juridico", "imobiliaria-juridico", "contabil-juridico", "tech-juridico"],
    "Compliance": ["onix-co-compliance", "investimentos-compliance", "educacao-compliance", "corretora-compliance", "imobiliaria-compliance", "contabil-compliance", "tech-compliance"],
    "Qualidade e Pós-venda": [
      "investimentos-qualidade",
      "educacao-qualidade",
      "corretora-qualidade",
      "imobiliaria-qualidade",
      "contabil-qualidade",
      "tech-qualidade",
    ],
    "Backoffice": [
      "investimentos-backoffice",
      "educacao-backoffice",
      "corretora-backoffice",
      "imobiliaria-backoffice",
      "contabil-backoffice",
      "tech-backoffice",
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

test("30 transversais — as MESMAS 5 funções em cada uma das 6 empresas", () => {
  const transversais = idsTransversais();
  assert.equal(transversais.length, 30);

  const FUNCOES = [
    "ADM/Financeiro",
    "Backoffice",
    "Compliance",
    "Jurídico",
    "Qualidade e Pós-venda",
  ];

  for (const id of transversais) {
    const e = empresaDoGrupo(id);
    assert.ok(e);
    assert.ok(FUNCOES.includes(e.nome), `"${id}" é transversal com rótulo fora da lista`);
    assert.equal(e.tipo, "departamento");
    assert.equal(e.consolida !== true, true, `"${id}" é transversal E consolida`);
  }

  // Cinco por empresa, as mesmas cinco, e a holding sem nenhuma.
  for (const empresa of idsPorTipo("empresa")) {
    const daEmpresa = transversais
      .filter((id) => empresaDoGrupo(id)?.parentId === empresa)
      .map((id) => empresaDoGrupo(id)!.nome)
      .sort();
    assert.deepEqual(daEmpresa, FUNCOES, `${empresa} não tem as 5 transversais`);
  }
  assert.equal(
    transversais.filter((id) => empresaDoGrupo(id)?.parentId === RAIZ_DO_GRUPO).length,
    0,
    "a holding não tem transversal — ela tem consolidador",
  );
});

test("4 consolidadores, todos na holding, nenhum transversal", () => {
  const consolidadores = CATALOGO_EMPRESAS.filter((e) => e.consolida === true);
  assert.deepEqual(
    consolidadores.map((e) => e.id),
    ["onix-co-adm", "onix-co-juridico", "onix-co-compliance", "onix-co-clientes"],
  );
  for (const e of consolidadores) {
    assert.equal(e.parentId, RAIZ_DO_GRUPO, `${e.id} não pendura na holding`);
    assert.equal(e.tipo, "departamento");
    assert.notEqual(e.transversal, true, `${e.id} consolida E é transversal`);
  }
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
  assert.equal(d.soNoCadastro.length, 40);
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

// ── O CAMINHO ATÉ O NÓ ────────────────────────────────────────────────────

test("o caminho vai da raiz até o nó, pelos rótulos", () => {
  assert.deepEqual(caminhoNoCatalogo("tech-qualidade"), [
    "Onix Co",
    "Onix Tech",
    "Qualidade e Pós-venda",
  ]);
  assert.deepEqual(caminhoNoCatalogo(RAIZ_DO_GRUPO), ["Onix Co"]);
});

test("o caminho DESAMBIGUA os rótulos repetidos — que é para isso que ele existe", () => {
  // As 6 Qualidades são indistinguíveis pelo rótulo; pelo caminho, não. Um
  // seletor sem isso pede escolha no escuro, e escolher errado concede acesso
  // à empresa errada em silêncio.
  //
  // Com a estrutura de 48 nós isso deixou de ser um caso de 6 e virou um de 30:
  // são 5 funções transversais em CADA uma das 6 empresas, e agora existem sete
  // "Jurídico" no grupo contando o consolidador da holding. Quanto mais rótulo
  // repetido, mais o caminho é a única coisa que separa um do outro.
  const rotulos = idsTransversais().map((id) =>
    rotuloComCaminho(id, CATALOGO_EMPRESAS, { semRaiz: true }),
  );
  assert.equal(rotulos.length, 30);
  assert.equal(new Set(rotulos).size, 30);
  assert.ok(rotulos.includes("Onix Tech › Qualidade e Pós-venda"));

  // E as duas "Onix Corretora": a empresa e o departamento dentro dela.
  assert.equal(
    rotuloComCaminho("corretora", CATALOGO_EMPRESAS, { semRaiz: true }),
    "Onix Corretora",
  );
  assert.equal(
    rotuloComCaminho("corretora-corretora", CATALOGO_EMPRESAS, { semRaiz: true }),
    "Onix Corretora › Onix Corretora",
  );
});

test("todo nó do catálogo tem rótulo-com-caminho único", () => {
  // A propriedade que faz o seletor voltar a ser confiável: dois irmãos não
  // podem ter o mesmo rótulo sem serem o mesmo nó, então o caminho identifica.
  const rotulos = CATALOGO_EMPRESAS.map((e) =>
    rotuloComCaminho(e.id, CATALOGO_EMPRESAS, { semRaiz: true }),
  );
  assert.equal(new Set(rotulos).size, CATALOGO_EMPRESAS.length);
});

test("semRaiz corta a holding, mas nunca some com o nó", () => {
  // A holding aparece em TODOS os caminhos e vira ruído numa lista de opções.
  // O caso limite é ela própria: cortar a raiz do caminho dela deixaria string
  // vazia, e uma opção sem texto é pior que uma repetida.
  assert.equal(rotuloComCaminho(RAIZ_DO_GRUPO, CATALOGO_EMPRESAS, { semRaiz: true }), "Onix Co");
});

test("id que não está na lista devolve o id cru, não string vazia", () => {
  assert.deepEqual(caminhoDe("fantasma", CATALOGO_EMPRESAS), []);
  assert.equal(rotuloComCaminho("fantasma", CATALOGO_EMPRESAS), "fantasma");
});

test("o caminho é montado sobre a lista RECEBIDA, não sobre o catálogo", () => {
  // É o que permite a tela usar as linhas do banco: se banco e catálogo
  // divergirem, quem manda é o banco — é ele que o RBAC consulta.
  const doBanco = [
    { id: "onix-co", nome: "Onix Co (renomeada na mão)", parentId: null },
    { id: "tech", nome: "Tech", parentId: "onix-co" },
  ];
  assert.deepEqual(caminhoDe("tech", doBanco), ["Onix Co (renomeada na mão)", "Tech"]);
});

test("ciclo em parentId não trava — devolve o que deu para subir", () => {
  // `parentId` é dado editável; A→B→A faria a subida rodar para sempre.
  const ciclo = [
    { id: "a", nome: "A", parentId: "b" },
    { id: "b", nome: "B", parentId: "a" },
  ];
  const caminho = caminhoDe("a", ciclo);
  assert.ok(caminho.length > 0 && caminho.length <= 2);
});

test("pai órfão corta o caminho em vez de sumir com o nó", () => {
  const orfao = [{ id: "solto", nome: "Solto", parentId: "fantasma" }];
  assert.deepEqual(caminhoDe("solto", orfao), ["Solto"]);
});

// ── A HERANÇA NÃO É MAIS O PADRÃO ─────────────────────────────────────────

test("o schema declara incluiDescendentes com default false", () => {
  // A decisão do item 4 mora no BANCO, não em código — então é o schema que
  // este teste lê. Com 3 níveis, um default que herda concede mais do que foi
  // pedido, e num campo de permissão essa é a forma errada de errar.
  const schema = readFileSync("prisma/schema.prisma", "utf8");
  const linha = /incluiDescendentes\s+Boolean\s+@default\((\w+)\)/.exec(schema);
  assert.ok(linha, "campo incluiDescendentes não encontrado em prisma/schema.prisma");
  assert.equal(linha[1], "false");
});
