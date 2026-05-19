import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { testGoogleConnection } from "@/lib/integrations/google-calendar";

/**
 * GET /api/integracoes/google/test
 * Testa a conexão Google do usuário logado (UserGoogleAuth).
 */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { success: false, message: "Não autenticado" },
      { status: 401 },
    );
  }
  const result = await testGoogleConnection(session.userId);
  return NextResponse.json(result);
}
