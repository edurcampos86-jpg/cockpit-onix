import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getAuthContext, isAdmin } from "@/lib/auth-helpers";
import { EMPRESAS } from "@/lib/empresas-config";
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

  const empresas = EMPRESAS.map((e) => ({ id: e.id, nome: e.nome }));

  return <ImplementacoesList itens={dto} empresas={empresas} />;
}
