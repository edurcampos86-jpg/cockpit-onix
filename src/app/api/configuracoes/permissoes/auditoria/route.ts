import { NextResponse } from "next/server";
import { guardAdminApi } from "@/lib/api-admin-guard";
import { prisma } from "@/lib/prisma";
import { auditarAcessoPorEmpresa } from "@/lib/empresas/auditoria-core";
import { divergencias, idsNoHub } from "@/lib/empresas/catalogo";

export const dynamic = "force-dynamic";

/**
 * GET /api/configuracoes/permissoes/auditoria — quem enxerga qual empresa, de
 * verdade.
 *
 * ── O QUE ELA RESPONDE QUE A TELA NÃO RESPONDE ───────────────────────────
 * `/configuracoes/permissoes` mostra CONCESSÕES. Esta rota mostra o EFEITO
 * delas, que é outra coisa: com a herança já resolvida, com as concessões
 * órfãs separadas das válidas, e com os casos em que restringir não restringiu
 * nada marcados por nome. É a diferença entre "o que eu cliquei" e "o que a
 * pessoa vê" — e essas duas listas divergem por três regras deliberadas que
 * operam em silêncio (documentadas em `lib/empresas/auditoria-core.ts`).
 *
 * ── POR QUE UMA ROTA, E NÃO UMA ABA ──────────────────────────────────────
 * O consumo natural disto é conferência pontual e antes-de-deploy — `curl` na
 * mão, saída colada num issue —, não navegação diária. Tela exigiria decidir
 * paginação, ordenação e filtro para um dado que hoje tem dezenas de linhas e
 * é lido de vez em quando. A rota entrega o dado inteiro de uma vez, em JSON
 * que se lê com `jq`; se virar rotina, a tela nasce por cima dela sem refazer
 * a regra.
 *
 * ── ADMIN, PELA MESMA RÉGUA DE /api/configuracoes ────────────────────────
 * A resposta é um mapa completo de quem-vê-o-quê no grupo, com nome e e-mail
 * de todo o time e com os buracos de configuração apontados a dedo — leitura
 * ideal para quem quer escolher qual conta comprometer. `guardAdminApi` falha
 * fechada; ninguém sem admin lê uma linha.
 *
 * ── SÓ LEITURA ───────────────────────────────────────────────────────────
 * Nenhum método além de GET. Não corrige nada do que aponta, de propósito:
 * `restricao_vazia` pode ser herança intencional (sócio que enxerga o grupo)
 * ou engano de quem esqueceu de desligar `incluiDescendentes`, e as duas se
 * parecem no dado. Adivinhar seria revogar permissão sem ninguém pedir.
 */
export async function GET() {
  const negado = await guardAdminApi("/api/configuracoes/permissoes/auditoria");
  if (negado) return negado;

  const [pessoas, concessoes, empresas] = await Promise.all([
    prisma.pessoa.findMany({
      select: { id: true, nomeCompleto: true, email: true, status: true, userId: true },
      orderBy: { nomeCompleto: "asc" },
    }),
    prisma.pessoaEmpresa.findMany({
      select: { pessoaId: true, empresaId: true, incluiDescendentes: true },
    }),
    prisma.empresa.findMany({ select: { id: true, parentId: true, nome: true } }),
  ]);

  const auditoria = auditarAcessoPorEmpresa({
    pessoas: pessoas.map((p) => ({
      id: p.id,
      nome: p.nomeCompleto,
      email: p.email,
      status: p.status,
      temUsuario: p.userId !== null,
    })),
    concessoes,
    empresas,
    idsNoHub: idsNoHub(),
  });

  /* O estado do CADASTRO vai junto porque sem ele a auditoria mente por
   * omissão. `PessoaEmpresa.empresaId` tem FK para `Empresa`: empresa que não
   * foi semeada não pode nem RECEBER concessão — a tentativa é recusada pelo
   * banco. Então um ambiente onde o seed nunca rodou não mostra alerta nenhum;
   * mostra `linhas` sem restrição, que se lê como "está tudo certo" quando o
   * significado é "o RBAC de empresa está inerte". Foi exatamente esse achado
   * que motivou `scripts/seed-empresas.ts`, e `rbacInerte` é ele por escrito. */
  const { nosDois, soNoHub, soNoCadastro } = divergencias();
  const noBanco = new Set(empresas.map((e) => e.id));
  const cadastro = {
    empresas: empresas.map((e) => ({ id: e.id, nome: e.nome, parentId: e.parentId })),
    /** Declaradas no catálogo e AUSENTES do banco — falta rodar o seed. */
    faltandoSeed: [...nosDois, ...soNoCadastro].filter((id) => !noBanco.has(id)),
    /** No catálogo como anunciadas: não dá para conceder acesso a elas. */
    anunciadasSemCadastro: soNoHub,
    /** Cadastradas fora do hub: acesso funciona, descoberta pela tela inicial não. */
    foraDoHub: soNoCadastro,
    /** Nenhuma empresa cadastrada ⇒ nenhuma concessão tem efeito. */
    rbacInerte: empresas.length === 0,
  };

  return NextResponse.json({
    ...auditoria,
    cadastro,
    timestamp: new Date().toISOString(),
  });
}
