import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getAuthContext, isAdmin } from "@/lib/auth-helpers";
import { opcoesFiltroEmpresa } from "@/lib/empresas-config";
import { calcularMetricasBacklog } from "@/lib/implementacoes/metricas";
import { ImplementacoesList, type ImplementacaoDTO } from "./implementacoes-list";

export const dynamic = "force-dynamic";

/**
 * Teto de linhas trazidas por render. A página é `force-dynamic` e o filtro roda
 * no cliente, então TODA a fila viaja em TODO acesso. Hoje isso é barato; com
 * `promptGerado` (texto longo) entrando no modelo e a fila crescendo — que é o
 * objetivo declarado do fluxo guiado —, deixa de ser.
 *
 * O teto é uma trava de segurança, não paginação: acima dele a tela avisa em vez
 * de esconder em silêncio, e aí vale trocar por filtro server-side de verdade.
 */
const MAX_LINHAS = 300;

export default async function ImplementacoesPage() {
  const ctx = await getAuthContext().catch(() => null);
  if (!ctx) redirect("/login");
  if (!isAdmin(ctx)) redirect("/");

  // `select` explícito em vez de `include`: `como` e `createdAt` estavam no
  // payload sem nenhuma célula os renderizando. Campo de texto livre que a
  // tabela não mostra é peso puro no HTML serializado do RSC.
  const [total, itens, paraMetrica] = await Promise.all([
    prisma.implementacao.count(),
    prisma.implementacao.findMany({
      orderBy: [{ score: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      take: MAX_LINHAS,
      select: {
        id: true,
        empresaId: true,
        tipo: true,
        porQue: true,
        oQue: true,
        printUrl: true,
        reach: true,
        impact: true,
        confidence: true,
        effort: true,
        score: true,
        status: true,
        prNumero: true,
        prUrl: true,
        prStatus: true,
        anexos: {
          select: { id: true, nomeArquivo: true, contentType: true },
          orderBy: { ordem: "asc" },
        },
      },
    }),
    // Query PRÓPRIA da métrica, sem `take`: o teto acima corta as linhas de
    // menor score, e "quantas ideias viraram entrega" sobre uma amostra
    // truncada seria um número errado apresentado com cara de certo. São 4
    // campos escalares por linha — barato mesmo com a fila inteira.
    prisma.implementacao.findMany({
      select: {
        createdAt: true,
        prNumero: true,
        prStatus: true,
        prMergedAt: true,
      },
    }),
  ]);

  const metricas = calcularMetricasBacklog(paraMetrica);

  const dto: ImplementacaoDTO[] = itens;

  // Opções derivadas da fase inicial UNIDA aos empresaId realmente gravados —
  // assim nenhuma linha visível na tabela fica sem opção correspondente no filtro.
  const empresas = opcoesFiltroEmpresa(itens.map((i) => i.empresaId));

  return (
    <ImplementacoesList
      itens={dto}
      empresas={empresas}
      ocultadas={Math.max(0, total - itens.length)}
      metricas={metricas}
    />
  );
}
