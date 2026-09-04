import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-helpers";
import { plaudConciliacaoUiHabilitada } from "@/lib/reunioes/conciliacao-flag";
import { deveExporMesaConciliacao, lerLimiteConciliacao } from "@/lib/reunioes/conciliacao";
import { carregarMesaConciliacao } from "@/lib/reunioes/inbox-server";

export const dynamic = "force-dynamic";

/** GET read-only da Fase 0. OFF responde 404 para ficar indistinguível de ausente. */
export async function GET(request: NextRequest) {
  if (!deveExporMesaConciliacao(await plaudConciliacaoUiHabilitada())) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const ctx = await getAuthContext().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "Não autenticado." }, { status: 403 });

  const limite = lerLimiteConciliacao(request.nextUrl.searchParams.get("limit"));
  if (limite === null) {
    return NextResponse.json(
      { error: "limit deve ser um inteiro entre 1 e 100" },
      { status: 400 },
    );
  }

  const payload = await carregarMesaConciliacao(ctx, limite);
  return NextResponse.json(payload);
}
