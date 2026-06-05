import { prisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth-helpers";
import { EMPRESAS } from "@/lib/empresas-config";
import { ImplementacoesList, type ImplementacaoDTO } from "./implementacoes-list";

export const dynamic = "force-dynamic";

export default async function ImplementacoesPage() {
  await getAuthContext(); // exige login

  const itens = await prisma.implementacao.findMany({
    orderBy: [{ score: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
  });

  const dto: ImplementacaoDTO[] = itens.map((i) => ({
    id: i.id,
    empresaId: i.empresaId,
    tipo: i.tipo,
    porQue: i.porQue,
    como: i.como,
    oQue: i.oQue,
    printUrl: i.printUrl,
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
