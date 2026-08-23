import assert from "node:assert/strict";
import { test } from "node:test";
import { auditarAcessoPorEmpresa, estadoDoRbac, type EntradaAuditoria } from "./auditoria-core";
import type { NoEmpresa } from "./hierarquia";

/** Árvore já reparentada: a raiz com as demais penduradas nela. */
const GRUPO: NoEmpresa[] = [
  { id: "onix-co", parentId: null },
  { id: "investimentos", parentId: "onix-co" },
  { id: "corretora", parentId: "onix-co" },
  { id: "planejamento", parentId: "onix-co" },
];

const NO_HUB = ["investimentos", "corretora"];

function pessoa(id: string, extra: Partial<EntradaAuditoria["pessoas"][number]> = {}) {
  return {
    id,
    nome: id,
    email: `${id}@onix.test`,
    status: "ativo",
    temUsuario: true,
    ...extra,
  };
}

function auditar(
  pessoas: EntradaAuditoria["pessoas"],
  concessoes: EntradaAuditoria["concessoes"],
  empresas: NoEmpresa[] = GRUPO,
) {
  return auditarAcessoPorEmpresa({ pessoas, concessoes, empresas, idsNoHub: NO_HUB });
}

const codigos = (linha: { alertas: { codigo: string }[] }) => linha.alertas.map((a) => a.codigo);

test("sem concessão nenhuma: sem filtro, sem alerta", () => {
  const { linhas, resumo } = auditar([pessoa("ana")], []);
  assert.equal(linhas[0].efetivas, null);
  assert.deepEqual(linhas[0].alertas, []);
  assert.equal(resumo.comConcessao, 0);
  assert.equal(resumo.comFiltroEfetivo, 0);
});

test("a herança aparece SEPARADA da concessão direta", () => {
  // É a pergunta que motiva a rota: "por que fulano vê a Onix Corretora se
  // ninguém deu isso a ele?" — resposta: veio pendurada na raiz.
  const { linhas } = auditar(
    [pessoa("bia")],
    [{ pessoaId: "bia", empresaId: "onix-co", incluiDescendentes: true }],
  );
  assert.deepEqual(linhas[0].efetivas, ["corretora", "investimentos", "onix-co", "planejamento"]);
  assert.deepEqual(linhas[0].porHeranca, ["corretora", "investimentos", "planejamento"]);
});

test("herança desligada concede só a empresa exata", () => {
  const { linhas } = auditar(
    [pessoa("caio")],
    [{ pessoaId: "caio", empresaId: "onix-co", incluiDescendentes: false }],
  );
  assert.deepEqual(linhas[0].efetivas, ["onix-co"]);
  assert.deepEqual(linhas[0].porHeranca, []);
});

/* Os dois testes de órfã exercitam um caminho que a FK
 * `PessoaEmpresa_empresaId_fkey` (ON DELETE CASCADE) hoje torna inalcançável
 * pelo banco — conferido com INSERT direto: o Postgres recusa. Eles continuam
 * porque `empresasVisiveis` tolera órfã de propósito, e é essa tolerância que a
 * auditoria tem de espelhar: no dia em que a FK cair, a regra libera acesso em
 * silêncio e este é o único alarme. Não confundir com cobertura de produção. */
test("concessão órfã é apontada, não ignorada em silêncio", () => {
  const { linhas } = auditar(
    [pessoa("dio")],
    [
      { pessoaId: "dio", empresaId: "investimentos", incluiDescendentes: false },
      { pessoaId: "dio", empresaId: "empresa-que-nao-existe", incluiDescendentes: true },
    ],
  );
  assert.ok(codigos(linhas[0]).includes("concessao_orfa"));
  // A válida continua valendo — uma órfã não derruba a outra.
  assert.deepEqual(linhas[0].efetivas, ["investimentos"]);
});

test("TODAS as concessões órfãs devolvem a pessoa a 'vê tudo' — e isso vira alerta", () => {
  // O caso perigoso: o admin acha que restringiu, e a regra não-disruptiva
  // (correta) devolveu acesso total. Sem alerta, ninguém descobre.
  const { linhas } = auditar(
    [pessoa("edu")],
    [{ pessoaId: "edu", empresaId: "fantasma", incluiDescendentes: true }],
  );
  assert.equal(linhas[0].efetivas, null);
  assert.ok(codigos(linhas[0]).includes("restricao_anulada"));
});

test("restrição que cobre o grupo inteiro é sinalizada como vazia", () => {
  const { linhas } = auditar(
    [pessoa("fer")],
    [{ pessoaId: "fer", empresaId: "onix-co", incluiDescendentes: true }],
  );
  assert.ok(codigos(linhas[0]).includes("restricao_vazia"));
});

test("Pessoa sem User: concessão gravada, efeito nenhum em runtime", () => {
  // `getAuthContext` resolve a Pessoa por `userId`. Sem User, `ctx.pessoa` é
  // null e tanto o hub quanto o gate de página liberam tudo. Foi este o motivo
  // de a primeira validação ao vivo mostrar 0 nós travados.
  const { linhas } = auditar(
    [pessoa("gil", { temUsuario: false })],
    [{ pessoaId: "gil", empresaId: "investimentos", incluiDescendentes: false }],
  );
  assert.ok(codigos(linhas[0]).includes("sem_usuario"));
});

test("pessoa arquivada com concessão é apontada", () => {
  const { linhas } = auditar(
    [pessoa("hugo", { status: "arquivado" })],
    [{ pessoaId: "hugo", empresaId: "corretora", incluiDescendentes: false }],
  );
  assert.ok(codigos(linhas[0]).includes("arquivada_com_acesso"));
});

test("empresa acessível que não está no hub é sinalizada", () => {
  // `planejamento` tem rota e cadastro e NÃO é nó do hub: quem recebe acesso a
  // ela não descobre isso pela tela inicial.
  const { linhas } = auditar(
    [pessoa("ivo")],
    [{ pessoaId: "ivo", empresaId: "planejamento", incluiDescendentes: false }],
  );
  const alerta = linhas[0].alertas.find((a) => a.codigo === "invisivel_no_hub");
  assert.ok(alerta);
  assert.deepEqual(alerta.empresas, ["planejamento"]);
});

test("quem não tem filtro não recebe alerta de hub", () => {
  // `efetivas === null` significa "vê tudo": listar aí as empresas fora do hub
  // marcaria a equipe inteira, todo dia, sem nada a corrigir.
  const { linhas } = auditar([pessoa("joana")], []);
  assert.deepEqual(codigos(linhas[0]), []);
});

test("banco de empresas vazio não gera falso alarme de restrição", () => {
  // `Empresa` vazia torna o RBAC inteiro inerte. A rota reporta isso no bloco
  // `cadastro.rbacInerte`; aqui o que importa é não inventar "restrição vazia"
  // porque 0 === 0.
  const { linhas } = auditar(
    [pessoa("k")],
    [{ pessoaId: "k", empresaId: "investimentos", incluiDescendentes: true }],
    [],
  );
  assert.ok(!codigos(linhas[0]).includes("restricao_vazia"));
  assert.ok(codigos(linhas[0]).includes("restricao_anulada"));
});

test("o resumo conta concessão e filtro EFETIVO separadamente", () => {
  const { resumo } = auditar(
    [pessoa("l"), pessoa("m"), pessoa("n")],
    [
      { pessoaId: "l", empresaId: "investimentos", incluiDescendentes: false },
      { pessoaId: "m", empresaId: "fantasma", incluiDescendentes: false },
    ],
  );
  assert.equal(resumo.pessoas, 3);
  assert.equal(resumo.comConcessao, 2); // l e m
  assert.equal(resumo.comFiltroEfetivo, 1); // só l — a de m não resolveu
  assert.equal(resumo.alertas.restricao_anulada, 1);
});

test("cada pessoa é auditada com as PRÓPRIAS concessões", () => {
  const { linhas } = auditar(
    [pessoa("o"), pessoa("p")],
    [
      { pessoaId: "o", empresaId: "investimentos", incluiDescendentes: false },
      { pessoaId: "p", empresaId: "corretora", incluiDescendentes: false },
    ],
  );
  assert.deepEqual(linhas[0].efetivas, ["investimentos"]);
  assert.deepEqual(linhas[1].efetivas, ["corretora"]);
});

/* ── estadoDoRbac: os dois buracos, separados ──────────────────────────── */

test("banco vazio: sem cadastro E inerte", () => {
  const e = estadoDoRbac({ nosCadastrados: 0, concessoes: 0 });
  assert.equal(e.semCadastro, true);
  assert.equal(e.rbacInerte, true);
});

test("depois do seed, sem conceder nada: cadastro de pé e AINDA inerte", () => {
  // O caso que motivou a mudança. A flag antiga (`nosCadastrados === 0`)
  // apagaria aqui e diria "configurado" sobre um RBAC que não restringe
  // ninguém — silêncio enganoso no exato momento em que alguém acha que
  // terminou de configurar.
  const e = estadoDoRbac({ nosCadastrados: 20, concessoes: 0 });
  assert.equal(e.semCadastro, false);
  assert.equal(e.rbacInerte, true);
});

test("com uma concessão, deixa de ser inerte", () => {
  const e = estadoDoRbac({ nosCadastrados: 20, concessoes: 1 });
  assert.equal(e.semCadastro, false);
  assert.equal(e.rbacInerte, false);
});

test("as duas contagens saem cruas, para a tela poder mostrar as duas", () => {
  const e = estadoDoRbac({ nosCadastrados: 20, concessoes: 3 });
  assert.equal(e.nosCadastrados, 20);
  assert.equal(e.concessoes, 3);
});
