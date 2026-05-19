import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { disconnectMicrosoftForUser } from "@/lib/integrations/microsoft-user-oauth";

/**
 * POST /api/integracoes/microsoft/disconnect
 * Apaga o registro local (Microsoft nao tem revoke REST direto;
 * usuario pode revogar tambem em myaccount.microsoft.com/Permissions).
 */
export async function POST() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  await disconnectMicrosoftForUser(session.userId);
  return NextResponse.json({ disconnected: true });
}
