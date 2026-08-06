import { NextResponse } from "next/server";
import * as btg from "@/lib/integrations/btg";
import { guardAdminApi } from "@/lib/api-admin-guard";

/** GET /api/integracoes/btg/positions/[account] -> posição de uma conta */
export async function GET(_req: Request, { params }: { params: Promise<{ account: string }> }) {
  const negado = await guardAdminApi("btg/positions/[account]");
  if (negado) return negado;

  const { account } = await params;
  try {
    const r = await btg.getPositionByAccount(account);
    return NextResponse.json({ success: r.status === 200, status: r.status, data: r.body });
  } catch (e) {
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : "erro" },
      { status: 500 },
    );
  }
}
