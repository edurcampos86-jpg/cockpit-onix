import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getAuthContext, isAdmin } from "@/lib/auth-helpers";
import { permissoesUiHabilitado } from "@/lib/permissoes/flag";
import { PageHeader } from "@/components/layout/page-header";
import {
  PermissoesTabs,
  type PapelDTO,
  type CarteiraDTO,
  type PessoaDTO,
  type ApoioDTO,
  type EmpresaDTO,
  type AcessoEmpresaDTO,
} from "./permissoes-tabs";

export const dynamic = "force-dynamic";

export default async function PermissoesPage() {
  // Flag OFF → finge que a rota não existe.
  if (!(await permissoesUiHabilitado())) notFound();

  // Gate admin (segurança real; o nav é só cosmético).
  const ctx = await getAuthContext().catch(() => null);
  if (!ctx) redirect("/login");
  if (!isAdmin(ctx)) redirect("/");

  const papeis = await prisma.papel.findMany({
    orderBy: [{ adminGlobal: "desc" }, { nome: "asc" }],
    include: { permissoes: true },
  });

  const dto: PapelDTO[] = papeis.map((p) => ({
    id: p.id,
    nome: p.nome,
    isSistema: p.isSistema,
    escopoOperacional: p.escopoOperacional,
    adminGlobal: p.adminGlobal,
    permissoes: p.permissoes.map((pp) => ({ area: pp.area, nivel: pp.nivel })),
  }));

  // Carteiras (com dono + CGEs + nº de acessos) e Pessoas (p/ o select de dono).
  const [carteirasRaw, pessoasRaw] = await Promise.all([
    prisma.carteira.findMany({
      orderBy: { nome: "asc" },
      include: {
        cges: { orderBy: { cge: "asc" } },
        dono: { select: { id: true, nomeCompleto: true, apelido: true } },
        _count: { select: { acessos: true } },
      },
    }),
    prisma.pessoa.findMany({
      where: { status: "ativo" },
      orderBy: { nomeCompleto: "asc" },
      select: { id: true, nomeCompleto: true, apelido: true, papelId: true },
    }),
  ]);

  // Apoios existentes (AcessoCarteira tipo="apoia"). O DONO vem de Carteira.donoId
  // (aba Carteiras), NÃO daqui — esta aba edita só papel + apoios.
  const apoiosRaw = await prisma.acessoCarteira.findMany({
    where: { tipo: "apoia" },
    select: { id: true, pessoaId: true, carteiraId: true },
  });

  // Contagem read-only de clientes por carteira: ClienteBackoffice.assessorCge ∈ CGEs.
  const numClientes = await Promise.all(
    carteirasRaw.map((c) =>
      c.cges.length === 0
        ? Promise.resolve(0)
        : prisma.clienteBackoffice.count({
            where: { assessorCge: { in: c.cges.map((x) => x.cge) } },
          }),
    ),
  );

  const nomePessoa = (p: { nomeCompleto: string; apelido: string | null }) =>
    p.apelido?.trim() || p.nomeCompleto;

  const carteirasDTO: CarteiraDTO[] = carteirasRaw.map((c, i) => ({
    id: c.id,
    nome: c.nome,
    donoId: c.donoId,
    donoNome: c.dono ? nomePessoa(c.dono) : "—",
    cges: c.cges.map((x) => ({ id: x.id, cge: x.cge })),
    numClientes: numClientes[i],
    numAcessos: c._count.acessos,
  }));

  const pessoasDTO: PessoaDTO[] = pessoasRaw.map((p) => ({
    id: p.id,
    nome: nomePessoa(p),
    papelId: p.papelId,
  }));

  const apoiosDTO: ApoioDTO[] = apoiosRaw.map((a) => ({
    id: a.id,
    pessoaId: a.pessoaId,
    carteiraId: a.carteiraId,
  }));

  /* Acesso por EMPRESA — escopo separado do de carteiras. A árvore inteira vai
   * junto porque a aba precisa saber quem tem filhas para decidir se o toggle
   * de herança faz sentido naquela linha. */
  const [empresasRaw, acessosEmpresaRaw] = await Promise.all([
    prisma.empresa.findMany({
      orderBy: [{ parentId: "asc" }, { nome: "asc" }],
      // `tipo` vai junto porque a aba mostra o PAPEL ao lado do caminho —
      // holding/empresa/departamento não se deduz da profundidade nesta árvore
      // (há departamento pendurado direto na holding).
      select: { id: true, nome: true, parentId: true, tipo: true },
    }),
    prisma.pessoaEmpresa.findMany({
      select: { id: true, pessoaId: true, empresaId: true, incluiDescendentes: true },
    }),
  ]);

  const empresasDTO: EmpresaDTO[] = empresasRaw;
  const acessosEmpresaDTO: AcessoEmpresaDTO[] = acessosEmpresaRaw;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Permissões & Acessos"
        description="Papéis do sistema, escopo operacional e permissões por área. Leitura e edição de papéis (sem enforcement ainda)."
      />
      <div className="px-8 pb-8">
        <PermissoesTabs
          papeis={dto}
          carteiras={carteirasDTO}
          pessoas={pessoasDTO}
          apoios={apoiosDTO}
          empresas={empresasDTO}
          acessosEmpresa={acessosEmpresaDTO}
        />
      </div>
    </div>
  );
}
