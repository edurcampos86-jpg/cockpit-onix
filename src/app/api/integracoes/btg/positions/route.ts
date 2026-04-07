import { NextResponse } from "next/server";
import * as btg from "@/lib/integrations/btg";

/** GET /api/integracoes/btg/positions  -> posição consolidada do parceiro */
export async function GET() {
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
