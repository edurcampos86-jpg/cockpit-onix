import { test } from "node:test";
import assert from "node:assert/strict";
import {
  HREFS_ADMINISTRACAO,
  NOS_JURIDICO,
  REGRAS,
  podeVerHref,
  podeVerMidiasSociais,
  separarGrupos,
  type AcessoSidebar,
} from "./permissoes";

/* Os quatro perfis que existem, ou existiriam, no grupo. */

/** Como TODO MUNDO está hoje em produção: nenhuma concessão ⇒ sem restrição. */
const semRestricao = (extra: Partial<AcessoSidebar> = {}): AcessoSidebar => ({
  ehAdmin: false,
  ehLideranca: false,
  nos: null,
  ...extra,
});

/** Escopo restrito: ganhou concessão, logo passou a ser recortado. */
const restrito = (nos: string[], extra: Partial<AcessoSidebar> = {}): AcessoSidebar => ({
  ehAdmin: false,
  ehLideranca: false,
  nos: new Set(nos),
  ...extra,
});

const ADMIN = semRestricao({ ehAdmin: true });
const LIDER = semRestricao({ ehLideranca: true });

/* ── CARGO ─────────────────────────────────────────────────────────────── */

test("os 5 itens de administração só aparecem para admin", () => {
  const daAdministracao = [
    "/admin/auditoria/contratos",
    "/admin/backups",
    "/integracoes",
    "/configuracoes/flags",
    "/admin/juridico/email-ingest",
  ];
  for (const href of daAdministracao) {
    assert.equal(podeVerHref(href, ADMIN), true, `${href} devia aparecer para admin`);
    assert.equal(podeVerHref(href, LIDER), false, `${href} NÃO devia aparecer para líder`);
    assert.equal(
      podeVerHref(href, semRestricao()),
      false,
      `${href} NÃO devia aparecer para colaborador`,
    );
  }
});

test("Time e Insights: admin E líder, ninguém mais", () => {
  // A faixa é real: em 23/08/2026 havia 1 pessoa em `lideranca` e 4 em `admin`,
  // então isto recorta 5 de 22 — um conjunto MAIOR que só-admin.
  for (const href of ["/time", "/time/insights"]) {
    assert.equal(podeVerHref(href, ADMIN), true);
    assert.equal(podeVerHref(href, LIDER), true);
    assert.equal(podeVerHref(href, semRestricao()), false);
  }
});

test("os três abertos aparecem para todo mundo, inclusive colaborador restrito", () => {
  const ninguem = restrito([]);
  for (const href of ["/metodo", "/glossario", "/configuracoes/implementacoes"]) {
    assert.equal(podeVerHref(href, ninguem), true, `${href} devia ser aberto`);
  }
});

/* ── NÓ ────────────────────────────────────────────────────────────────── */

test("sem NENHUMA concessão a pessoa vê os itens de nó — é o estado de hoje", () => {
  // O caso que descreve a produção de 23/08/2026: 0 linhas em PessoaEmpresa.
  // `nos: null` é SEM RESTRIÇÃO, não "nenhum nó". Ler ao contrário esconderia
  // Jurídico e Parceiros de todas as 22 pessoas.
  const hoje = semRestricao();
  assert.equal(podeVerHref("/juridico/contratos", hoje), true);
  assert.equal(podeVerHref("/admin/importacao/juridico", hoje), true);
  assert.equal(podeVerHref("/time/parceiros", hoje), true);
  assert.equal(podeVerMidiasSociais(hoje), true);
});

test("com concessão a OUTRO nó, os itens de nó somem", () => {
  // É a primeira concessão que RESTRINGE — conceder não só soma, também tira.
  const soCompliance = restrito(["corretora-compliance"]);
  assert.equal(podeVerHref("/juridico/contratos", soCompliance), false);
  assert.equal(podeVerHref("/time/parceiros", soCompliance), false);
  assert.equal(podeVerMidiasSociais(soCompliance), false);
});

test("QUALQUER um dos sete Jurídicos libera — não só o da holding", () => {
  // Quem cuida do jurídico da Tech opera assunto jurídico igual a quem cuida do
  // da holding. Exigir o nó da holding transformaria a régua em "só a holding".
  assert.equal(NOS_JURIDICO.length, 7);
  for (const no of NOS_JURIDICO) {
    assert.equal(
      podeVerHref("/juridico/contratos", restrito([no])),
      true,
      `${no} devia liberar o Jurídico`,
    );
  }
});

test("Parceiros pede Onix Capital; Mídias Sociais pede o Marketing da holding", () => {
  assert.equal(podeVerHref("/time/parceiros", restrito(["investimentos"])), true);
  assert.equal(podeVerHref("/time/parceiros", restrito(["onix-co-marketing"])), false);

  assert.equal(podeVerMidiasSociais(restrito(["onix-co-marketing"])), true);
  assert.equal(podeVerMidiasSociais(restrito(["investimentos"])), false);
});

test("admin não é recortado por nó", () => {
  // Quem concede os nós dos outros precisa alcançar o grupo inteiro. Um admin
  // com uma concessão estreita ficaria sem o menu que usa para conceder.
  const adminEstreito = restrito(["tech-backoffice"], { ehAdmin: true });
  assert.equal(podeVerHref("/juridico/contratos", adminEstreito), true);
  assert.equal(podeVerHref("/time/parceiros", adminEstreito), true);
  assert.equal(podeVerMidiasSociais(adminEstreito), true);
});

/* ── DEFAULT ───────────────────────────────────────────────────────────── */

test("href que não está na matriz aparece — o default é permissivo", () => {
  // Deliberado: o gate é COSMÉTICO (cada página tem o próprio redirect), e um
  // default restritivo sumiria em silêncio com toda rota nova.
  assert.equal(REGRAS["/rota-que-nao-existe-ainda"], undefined);
  assert.equal(podeVerHref("/rota-que-nao-existe-ainda", restrito([])), true);
});

/* ── GRUPOS ────────────────────────────────────────────────────────────── */

const ITENS = [
  { href: "/metodo", name: "Método Onix" },
  { href: "/time", name: "Time" },
  { href: "/time/parceiros", name: "Parceiros" },
  { href: "/juridico/contratos", name: "Jurídico" },
  { href: "/admin/auditoria/contratos", name: "Auditoria" },
  { href: "/admin/backups", name: "Backups" },
  { href: "/glossario", name: "Glossário" },
  { href: "/integracoes", name: "Integrações" },
  { href: "/configuracoes/implementacoes", name: "Implementações" },
  { href: "/configuracoes/flags", name: "Flags" },
];

test("admin vê os dois grupos", () => {
  const { geral, administracao } = separarGrupos(ITENS, ADMIN);
  assert.deepEqual(
    administracao.map((i) => i.name),
    ["Auditoria", "Backups", "Integrações", "Flags"],
  );
  assert.equal(geral.length, 6);
});

test("colaborador NÃO recebe grupo de administração — vazio, para o cabeçalho sumir", () => {
  const { geral, administracao } = separarGrupos(ITENS, semRestricao());
  assert.deepEqual(administracao, []);
  // Sem Time (cargo). Com Parceiros e Jurídico, porque hoje ninguém é restrito.
  assert.deepEqual(
    geral.map((i) => i.name),
    ["Método Onix", "Parceiros", "Jurídico", "Glossário", "Implementações"],
  );
});

test("colaborador com escopo restrito perde também os itens de nó", () => {
  const { geral, administracao } = separarGrupos(ITENS, restrito(["contabil-backoffice"]));
  assert.deepEqual(administracao, []);
  assert.deepEqual(
    geral.map((i) => i.name),
    ["Método Onix", "Glossário", "Implementações"],
  );
});

test("líder fica entre os dois: ganha Time, não ganha administração", () => {
  const { geral, administracao } = separarGrupos(ITENS, LIDER);
  assert.deepEqual(administracao, []);
  assert.equal(
    geral.some((i) => i.name === "Time"),
    true,
  );
});

test("HREFS_ADMINISTRACAO é derivado da matriz, não digitado de novo", () => {
  // Se alguém marcar um href novo como `admin`, ele entra no grupo sozinho.
  // Uma segunda lista escrita à mão divergiria, e a divergência seria muda.
  for (const href of HREFS_ADMINISTRACAO) {
    assert.equal(REGRAS[href].tipo, "admin", `${href} está no grupo sem ser admin`);
  }
  const admins = Object.entries(REGRAS).filter(([, r]) => r.tipo === "admin");
  assert.equal(HREFS_ADMINISTRACAO.length, admins.length);
});

test("nenhum item vaza: colaborador restrito não vê NADA de admin nem de nó", () => {
  // O critério objetivo, como asserção. Varre a matriz inteira em vez de
  // conferir os itens que alguém lembrou de listar.
  const ninguem = restrito([]);
  for (const [href, regra] of Object.entries(REGRAS)) {
    const visivel = podeVerHref(href, ninguem);
    if (regra.tipo === "todos") assert.equal(visivel, true, `${href} devia aparecer`);
    else assert.equal(visivel, false, `${href} VAZOU para quem não tem acesso`);
  }
});
