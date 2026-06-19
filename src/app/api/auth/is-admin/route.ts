import { NextResponse } from "next/server";
import { getAuthContext, isAdmin } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

/**
 * isAdmin COMPLETO (role === "admin" OU pessoa.teamRole === "admin") pro client
 * (ex.: Sidebar) esconder itens admin-only do nav. Diferente de /api/auth/me, que
 * só expõe o `role` da sessão e não cobre o teamRole. Sem sessão → { isAdmin: false }.
 */
export async function GET() {
  const ctx = await getAuthContext().catch(() => null);
  if (!ctx) {
    return NextResponse.json({ isAdmin: false }, { status: 401 });
  }
  return NextResponse.json({ isAdmin: isAdmin(ctx) });
}
