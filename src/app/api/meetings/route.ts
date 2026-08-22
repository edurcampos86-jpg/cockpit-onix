import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-helpers";
import { escopoDeReunioes } from "@/lib/reunioes/escopo-reuniao-sessao";
import { filtrarReunioesPorEscopo } from "@/lib/reunioes/escopo-reuniao";

/**
 * GET /api/meetings — inbox de transcrições do Plaud.
 *
 * Filtrada por escopo. Até esta mudança a rota não fazia NENHUMA checagem além
 * da que o proxy já faz ("existe sessão"): qualquer pessoa logada lia a
 * transcrição inteira de qualquer reunião, enquanto a ficha do mesmo cliente
 * era gateada. Ver `src/lib/reunioes/escopo-reuniao.ts` para a régua e para o
 * porquê do eixo ser `vendedor`.
 */
export async function GET(request: NextRequest) {
  const ctx = await getAuthContext().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "Não autenticado." }, { status: 403 });

  const limit = parseInt(request.nextUrl.searchParams.get("limit") || "20");
  const escopo = await escopoDeReunioes(ctx);

  /*
   * O filtro roda DEPOIS do `take`, então quem tem escopo restrito pode receber
   * menos itens que o `limit` pedido. É deliberado: filtrar no banco exigiria
   * traduzir a régua de contenção de tokens para SQL, e uma régua duplicada em
   * dois dialetos é a que diverge. A tela lista dezenas, não milhares.
   */
  const meetings = await prisma.meeting.findMany({
    orderBy: { date: "desc" },
    take: limit,
    include: { lead: { select: { name: true, productInterest: true } } },
  });

  return NextResponse.json(filtrarReunioesPorEscopo(meetings, escopo));
}
