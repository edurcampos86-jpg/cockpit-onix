import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { gerarRetrospectiva } from "@/lib/painel-do-dia/retrospectiva";

/**
 * Permite ao usuario forçar a geracao da retrospectiva da semana anterior
 * manualmente (sem esperar cron domingo).
 */
export async function POST() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const r = await gerarRetrospectiva(session.userId);
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "falha" },
      { status: 500 }
    );
  }
}
