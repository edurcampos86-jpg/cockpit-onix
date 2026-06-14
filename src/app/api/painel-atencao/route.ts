import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import {
  getPainelAtencao,
  painelAtencaoBackendHabilitado,
} from "@/lib/painel-atencao/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/painel-atencao?assessorId=<assessorCge>
 *
 * Backend do Painel de Atenção ao Cliente — READ-ONLY, SEM UI.
 *
 * Duplo portão:
 *   1. Flag Config DB `PAINEL_ATENCAO_BACKEND` (default OFF) → 404 quando off
 *      (não vaza nem a existência da rota).
 *   2. Sessão válida (mesma proteção das rotas internas) → 401 sem sessão.
 */
export async function GET(req: NextRequest) {
  // 1. Flag desligada → finge que a rota não existe.
  if (!(await painelAtencaoBackendHabilitado())) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // 2. Mesma proteção das rotas internas: exige sessão.
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  }

  const assessorId = req.nextUrl.searchParams.get("assessorId")?.trim();
  if (!assessorId) {
    return NextResponse.json(
      { error: "parâmetro obrigatório: assessorId" },
      { status: 400 },
    );
  }

  try {
    const painel = await getPainelAtencao(assessorId);
    return NextResponse.json(painel);
  } catch (error) {
    console.error("[GET /api/painel-atencao] erro:", error);
    return NextResponse.json({ error: "erro interno" }, { status: 500 });
  }
}
