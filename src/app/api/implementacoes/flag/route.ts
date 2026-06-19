import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { implementacoesInlineHabilitado } from "@/lib/implementacoes/inline-flag";

export const dynamic = "force-dynamic";

/**
 * Status leve da flag IMPLEMENTACOES_INLINE pro FAB global decidir se renderiza.
 * Mesmo padrão de consumo do FloatingChat (fetch no mount). Exige sessão; sem
 * ela responde { enabled: false }.
 */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ enabled: false }, { status: 401 });
  }
  return NextResponse.json({ enabled: await implementacoesInlineHabilitado() });
}
