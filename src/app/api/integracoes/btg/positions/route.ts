import { NextResponse } from "next/server";
import * as btg from "@/lib/integrations/btg";
import { guardAdminApi } from "@/lib/api-admin-guard";

/** GET /api/integracoes/btg/positions  -> posição consolidada do parceiro */
export async function GET() {
  const negado = await guardAdminApi("btg/positions");
  if (negado) return negado;

  try {
    const r = await btg.getPartnerPositions();
    return NextResponse.json({ success: r.status === 200, status: r.status, data: r.body });
  } catch (e) {
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : "erro" },
      { status: 500 },
    );
  }
}
