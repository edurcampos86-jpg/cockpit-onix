import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { disconnectGoogleForUser } from "@/lib/integrations/google-user-oauth";

/**
 * POST /api/integracoes/google/disconnect
 * Revoga o refresh token no Google e apaga o registro local.
 */
export async function POST() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  await disconnectGoogleForUser(session.userId);
  return NextResponse.json({ disconnected: true });
}
