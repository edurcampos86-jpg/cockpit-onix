import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getAuthContext, isAdmin } from "@/lib/auth-helpers";
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
 * Triplo portão:
 *   1. Flag Config DB `PAINEL_ATENCAO_BACKEND` (default OFF) → 404 quando off
 *      (não vaza nem a existência da rota).
 *   2. Sessão válida (mesma proteção das rotas internas) → 401 sem sessão.
 *   3. Autz fail-closed: só admin passa → 403 para não-admin (a rota aceita
 *      assessorId arbitrário, então sem este gate qualquer sessão leria a
 *      carteira de qualquer assessor).
 */
export async function GET(req: NextRequest) {
  // 1. Flag desligada → finge que a rota não existe.
  if (!(await painelAtencaoBackendHabilitado())) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // 2. Mesma proteção das rotas internas: exige sessão. Este guard PRECEDE
  //    getAuthContext de propósito: getAuthContext()→requireSession() faz
  //    redirect("/login") quando não há sessão, o que numa rota de API viraria
  //    um 307 em vez do 401 JSON exigido. Com a sessão garantida aqui, o
  //    getAuthContext abaixo nunca dispara esse redirect.
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  }

  // 3. Autz fail-closed: resolve o contexto e exige admin ANTES de tocar o
  //    service. Não-admin sai aqui com 403 — não há caminho dele até o service.
  const ctx = await getAuthContext();
  if (!isAdmin(ctx)) {
    return NextResponse.json({ error: "acesso negado" }, { status: 403 });
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
