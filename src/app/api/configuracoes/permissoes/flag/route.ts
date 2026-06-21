import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { permissoesUiHabilitado } from "@/lib/permissoes/flag";

export const dynamic = "force-dynamic";

/**
 * Status leve da flag PERMISSOES_UI pro nav decidir se mostra o link "Permissões".
 * Mesmo padrão do /api/implementacoes/flag. Exige sessão; sem ela { enabled: false }.
 */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ enabled: false }, { status: 401 });
  }
  return NextResponse.json({ enabled: await permissoesUiHabilitado() });
}
