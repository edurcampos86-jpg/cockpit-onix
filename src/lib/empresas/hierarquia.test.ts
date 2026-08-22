import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  PROFUNDIDADE_MAXIMA,
  TIPOS,
  alturaDe,
  ehRaiz,
  profundidadeDe,
  validarArvore,
  validarArvoreCompleta,
  validarParent,
  validarTipos,
  type NoEmpresa,
  type NoTipado,
} from "./hierarquia.ts";

/**
 * Árvore PLANA: todo mundo raiz solta.
 *
 * Era o estado que o seed deixava até a PR-B4 — de lá em diante os nós nascem
 * pendurados, e esta forma passou a representar o BANCO ANTIGO ou o banco que
 * alguém desfez na mão. Continua sendo o fixture certo para exercitar a régua:
 * é sobre ele que `validarParent` responde "pode pendurar?", que é a pergunta
 * que o reparenting faz.
 */
const APOS_SEED: NoEmpresa[] = [
  { id: "onix-co", parentId: null },
  { id: "investimentos", parentId: null },
  { id: "corretora", parentId: null },
  { id: "imobiliaria", parentId: null },
  { id: "corporate", parentId: null },
  { id: "tech", parentId: null },
];

/** Os três níveis em miniatura: holding → empresa → departamento. */
const TRES_NIVEIS: NoTipado[] = [
  { id: "onix-co", parentId: null, tipo: "holding" },
  { id: "onix-co-expansao", parentId: "onix-co", tipo: "departamento" },
  { id: "investimentos", parentId: "onix-co", tipo: "empresa" },
  { id: "investimentos-qualidade", parentId: "investimentos", tipo: "departamento" },
];

// ── profundidadeDe ─────────────────────────────────────────────────────────

test("holding é nível 1; empresa é 2; departamento de empresa é 3", () => {
  assert.equal(profundidadeDe("onix-co", TRES_NIVEIS), 1);
  assert.equal(profundidadeDe("investimentos", TRES_NIVEIS), 2);
  assert.equal(profundidadeDe("investimentos-qualidade", TRES_NIVEIS), 3);
});

test("departamento da holding é nível 2 — mesmo nível de empresa", () => {
  // A coincidência que torna impossível deduzir `tipo` da profundidade: no
  // nível 2 convivem empresa e departamento.
  assert.equal(profundidadeDe("onix-co-expansao", TRES_NIVEIS), 2);
  assert.equal(profundidadeDe("investimentos", TRES_NIVEIS), 2);
});

test("empresa inexistente devolve null, não 0", () => {
  // 0 seria confundível com "raiz"; null diz "não sei responder".
  assert.equal(profundidadeDe("nao-existe", TRES_NIVEIS), null);
});

test("ciclo devolve null em vez de laço infinito", () => {
  const ciclo: NoEmpresa[] = [
    { id: "a", parentId: "b" },
    { id: "b", parentId: "a" },
  ];
  assert.equal(profundidadeDe("a", ciclo), null);
  assert.equal(profundidadeDe("b", ciclo), null);
});

test("pai órfão (fora da lista) devolve null", () => {
  const orfao: NoEmpresa[] = [{ id: "a", parentId: "fantasma" }];
  assert.equal(profundidadeDe("a", orfao), null);
});

// ── alturaDe ───────────────────────────────────────────────────────────────

test("folha tem altura 1; quem tem filho, 2; quem tem neto, 3", () => {
  assert.equal(alturaDe("investimentos-qualidade", TRES_NIVEIS), 1);
  assert.equal(alturaDe("investimentos", TRES_NIVEIS), 2);
  assert.equal(alturaDe("onix-co", TRES_NIVEIS), 3);
});

test("altura devolve null quando há ciclo abaixo", () => {
  const ciclo: NoEmpresa[] = [
    { id: "raiz", parentId: null },
    { id: "a", parentId: "raiz" },
    { id: "b", parentId: "a" },
    { id: "a2", parentId: "b" },
    { id: "b2", parentId: "a2" },
  ];
  // Cadeia longa demais para o número de nós só acontece com ciclo; a
  // salvaguarda de `alturaDe` é a mesma ideia de `profundidadeDe`.
  assert.equal(alturaDe("raiz", ciclo), 5);
  const fechado: NoEmpresa[] = [
    { id: "a", parentId: "b" },
    { id: "b", parentId: "a" },
  ];
  assert.equal(alturaDe("a", fechado), null);
});

// ── ehRaiz ─────────────────────────────────────────────────────────────────

test("ehRaiz distingue pai null de pai preenchido", () => {
  assert.equal(ehRaiz({ id: "onix-co", parentId: null }), true);
  assert.equal(ehRaiz({ id: "investimentos", parentId: "onix-co" }), false);
});

// ── validarParent: o caminho feliz do reparenting ──────────────────────────

test("pendurar empresa do seed na raiz é válido", () => {
  const r = validarParent("investimentos", "onix-co", APOS_SEED);
  assert.equal(r.ok, true);
});

test("pendurar departamento numa empresa é válido — é o terceiro nível", () => {
  // O movimento que a régua ANTERIOR recusava. É o coração desta PR.
  const r = validarParent("investimentos-qualidade", "investimentos", TRES_NIVEIS);
  assert.equal(r.ok, true);
});

test("virar raiz (parent null) é sempre válido", () => {
  const r = validarParent("investimentos", null, TRES_NIVEIS);
  assert.equal(r.ok, true);
});

// ── validarParent: as recusas ──────────────────────────────────────────────

test("quarto nível é recusado", () => {
  // "investimentos-qualidade" já está no nível 3; pendurar algo nela criaria o 4.
  const r = validarParent("onix-co-expansao", "investimentos-qualidade", TRES_NIVEIS);
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.motivo, "excede_profundidade");
});

test("auto-referência é recusada", () => {
  const r = validarParent("onix-co", "onix-co", APOS_SEED);
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.motivo, "auto_referencia");
});

test("pai inexistente é recusado", () => {
  const r = validarParent("investimentos", "fantasma", APOS_SEED);
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.motivo, "parent_inexistente");
});

test("nó inexistente é recusado", () => {
  const r = validarParent("fantasma", "onix-co", APOS_SEED);
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.motivo, "parent_inexistente");
});

test("pendurar dentro da própria subárvore é recusado como ciclo", () => {
  const r = validarParent("investimentos", "investimentos-qualidade", TRES_NIVEIS);
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.motivo, "ciclo");
});

test("quem tem filho CABE na holding e NÃO cabe numa empresa", () => {
  // O par que separa a régua de 3 da de 2. Com 2 níveis, "tem filhos?" bastava
  // para recusar; com 3, a mesma subárvore é aceita ou recusada conforme a
  // profundidade do destino — e é a ALTURA dela que decide.
  const comFilha: NoEmpresa[] = [
    { id: "onix-co", parentId: null },
    { id: "investimentos", parentId: "onix-co" },
    { id: "solta", parentId: null },
    { id: "filha-da-solta", parentId: "solta" },
  ];

  const paraHolding = validarParent("solta", "onix-co", comFilha);
  assert.equal(paraHolding.ok, true);

  const paraEmpresa = validarParent("solta", "investimentos", comFilha);
  assert.equal(paraEmpresa.ok, false);
  assert.equal(paraEmpresa.ok === false && paraEmpresa.motivo, "no_tem_filhos");
});

test("repor o mesmo pai de um nó folha é válido (idempotente)", () => {
  // Revalidar o vínculo existente não pode virar erro, senão um reparenting
  // re-executado falharia na segunda passada.
  const r = validarParent("investimentos-qualidade", "investimentos", TRES_NIVEIS);
  assert.equal(r.ok, true);
});

// ── validarArvore: auditoria da ESTRUTURA ──────────────────────────────────

test("estado logo após o seed da PR-A é sadio", () => {
  // Raízes soltas é estado VÁLIDO para a régua de profundidade — quem recusa
  // raiz que não seja holding é `validarTipos`.
  assert.deepEqual(validarArvore(APOS_SEED), []);
});

test("a árvore de 3 níveis é sadia", () => {
  assert.deepEqual(validarArvore(TRES_NIVEIS), []);
});

test("árvore vazia é sadia", () => {
  assert.deepEqual(validarArvore([]), []);
});

test("bisneto entrado por SQL manual é detectado na auditoria", () => {
  const comBisneto: NoEmpresa[] = [
    ...TRES_NIVEIS,
    { id: "sub", parentId: "investimentos-qualidade" },
  ];
  const problemas = validarArvore(comBisneto);
  assert.equal(problemas.length, 1);
  assert.equal(problemas[0].id, "sub");
  assert.equal(problemas[0].motivo, "excede_profundidade");
});

test("ciclo entrado por SQL manual é detectado, sem travar", () => {
  const ciclo: NoEmpresa[] = [
    { id: "a", parentId: "b" },
    { id: "b", parentId: "a" },
  ];
  const problemas = validarArvore(ciclo);
  assert.equal(problemas.length, 2);
  assert.equal(problemas.every((p) => p.motivo === "ciclo"), true);
});

test("o teto declarado é 3", () => {
  assert.equal(PROFUNDIDADE_MAXIMA, 3);
});

// ── validarTipos: a régua de PAPÉIS ────────────────────────────────────────

test("a árvore de 3 níveis passa na régua de papéis", () => {
  assert.deepEqual(validarTipos(TRES_NIVEIS), []);
});

test("árvore vazia não é 'holding ausente'", () => {
  // Tabela sem linha nenhuma é o estado de produção ANTES do seed. Chamar isso
  // de defeito faria a auditoria gritar sobre um banco que só não foi semeado.
  assert.deepEqual(validarTipos([]), []);
});

test("holding é única", () => {
  const duas: NoTipado[] = [
    ...TRES_NIVEIS,
    { id: "outra-holding", parentId: null, tipo: "holding" },
  ];
  const problemas = validarTipos(duas);
  assert.equal(problemas.length, 1);
  assert.equal(problemas[0].id, "outra-holding");
  assert.equal(problemas[0].motivo, "holding_repetida");
});

test("árvore sem holding nenhuma é reportada uma vez, sobre a árvore inteira", () => {
  const semHolding: NoTipado[] = [{ id: "solta", parentId: null, tipo: "empresa" }];
  const problemas = validarTipos(semHolding);
  assert.equal(problemas.length, 2);
  assert.equal(problemas[0].id, null);
  assert.equal(problemas[0].motivo, "holding_ausente");
  assert.equal(problemas[1].motivo, "raiz_sem_ser_holding");
});

test("holding com pai é recusada", () => {
  const presa: NoTipado[] = [
    { id: "onix-co", parentId: "investimentos", tipo: "holding" },
    { id: "investimentos", parentId: null, tipo: "empresa" },
  ];
  const motivos = validarTipos(presa).map((p) => p.motivo);
  assert.ok(motivos.includes("holding_com_pai"));
});

test("empresa pendurada em empresa é recusada", () => {
  const errada: NoTipado[] = [
    ...TRES_NIVEIS,
    { id: "sub-empresa", parentId: "investimentos", tipo: "empresa" },
  ];
  const problemas = validarTipos(errada);
  assert.equal(problemas.length, 1);
  assert.equal(problemas[0].id, "sub-empresa");
  assert.equal(problemas[0].motivo, "empresa_fora_da_holding");
});

test("departamento dentro de departamento é recusado", () => {
  // O jeito de furar a régua de 3 níveis que a PROFUNDIDADE sozinha não pega
  // quando o teto sobe: aqui o nó estaria no nível 3, dentro do teto, e ainda
  // assim fora da estrutura.
  const errado: NoTipado[] = [
    { id: "onix-co", parentId: null, tipo: "holding" },
    { id: "onix-co-expansao", parentId: "onix-co", tipo: "departamento" },
    { id: "sub-expansao", parentId: "onix-co-expansao", tipo: "departamento" },
  ];
  const motivos = validarTipos(errado).map((p) => p.motivo).sort();
  assert.deepEqual(motivos, ["departamento_com_filho", "pai_departamento"]);
});

test("departamento com filho é recusado mesmo que o filho seja empresa", () => {
  const errado: NoTipado[] = [
    { id: "onix-co", parentId: null, tipo: "holding" },
    { id: "onix-co-expansao", parentId: "onix-co", tipo: "departamento" },
    { id: "nova", parentId: "onix-co-expansao", tipo: "empresa" },
  ];
  const motivos = validarTipos(errado).map((p) => p.motivo).sort();
  assert.deepEqual(motivos, ["departamento_com_filho", "empresa_fora_da_holding"]);
});

test("departamento pode pendurar na holding OU numa empresa", () => {
  // As duas casas legítimas de um departamento — é o que separa "Expansão" das
  // seis "Qualidade e Pós-venda".
  assert.deepEqual(validarTipos(TRES_NIVEIS), []);
  const so = TRES_NIVEIS.filter((n) => n.id !== "investimentos-qualidade");
  assert.deepEqual(validarTipos(so), []);
});

test("pai inexistente não gera recusa de TIPO duplicada", () => {
  // `validarArvore` já reporta o pai órfão. Reportar de novo aqui daria duas
  // entradas para o mesmo defeito, e quem lê a auditoria contaria dois
  // problemas onde há um.
  const orfao: NoTipado[] = [
    { id: "onix-co", parentId: null, tipo: "holding" },
    { id: "perdida", parentId: "fantasma", tipo: "empresa" },
  ];
  assert.deepEqual(validarTipos(orfao), []);
  assert.equal(validarArvore(orfao).length, 1);
});

// ── validarArvoreCompleta ──────────────────────────────────────────────────

test("as duas réguas juntas dizem ok quando as duas passam", () => {
  assert.deepEqual(validarArvoreCompleta(TRES_NIVEIS), {
    estrutura: [],
    tipos: [],
    ok: true,
  });
});

test("ok é false se QUALQUER uma das duas reprovar", () => {
  const soTipoRuim: NoTipado[] = [
    ...TRES_NIVEIS,
    { id: "sub-empresa", parentId: "investimentos", tipo: "empresa" },
  ];
  const r = validarArvoreCompleta(soTipoRuim);
  assert.deepEqual(r.estrutura, []); // profundidade 3: dentro do teto
  assert.equal(r.tipos.length, 1);
  assert.equal(r.ok, false);
});

// ── O vocabulário é o mesmo do banco ───────────────────────────────────────

test("TIPOS espelha o enum TipoNo de prisma/schema.prisma", () => {
  // O tipo TS e o enum do Postgres são duas declarações do mesmo vocabulário.
  // Sem esta conferência, acrescentar um papel no schema e esquecer o union
  // (ou o contrário) só apareceria como erro de runtime na hora do INSERT.
  const schema = readFileSync("prisma/schema.prisma", "utf8");
  const bloco = /enum\s+TipoNo\s*\{([^}]*)\}/.exec(schema);
  assert.ok(bloco, "enum TipoNo não encontrado em prisma/schema.prisma");
  const doSchema = bloco[1]
    .split("\n")
    .map((l) => l.replace(/\/\/.*/, "").trim())
    .filter((l) => l.length > 0);
  assert.deepEqual(doSchema, [...TIPOS]);
});
