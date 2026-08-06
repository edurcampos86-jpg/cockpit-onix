import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getAuthContext, isAdmin } from "@/lib/auth-helpers";
import { opcoesFiltroEmpresa } from "@/lib/empresas-config";
import { ImplementacoesList, type ImplementacaoDTO } from "./implementacoes-list";

export const dynamic = "force-dynamic";

export default async function ImplementacoesPage() {
  const ctx = await getAuthContext().catch(() => null);
  if (!ctx) redirect("/login");
  if (!isAdmin(ctx)) redirect("/");

  const itens = await prisma.implementacao.findMany({
    orderBy: [{ score: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
    include: {
      anexos: {
        select: { id: true, nomeArquivo: true, contentType: true },
        orderBy: { ordem: "asc" },
      },
    },
  });

  const dto: ImplementacaoDTO[] = itens.map((i) => ({
    id: i.id,
    empresaId: i.empresaId,
    tipo: i.tipo,
    porQue: i.porQue,
    como: i.como,
    oQue: i.oQue,
    printUrl: i.printUrl,
    anexos: i.anexos,
    reach: i.reach,
    impact: i.impact,
    confidence: i.confidence,
    effort: i.effort,
    score: i.score,
    status: i.status,
    createdAt: i.createdAt.toISOString(),
  }));

  // Opções derivadas da fase inicial UNIDA aos empresaId realmente gravados —
  // assim nenhuma linha visível na tabela fica sem opção correspondente no filtro.
  const empresas = opcoesFiltroEmpresa(itens.map((i) => i.empresaId));

  return <ImplementacoesList itens={dto} empresas={empresas} />;
}
