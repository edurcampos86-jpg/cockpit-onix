import { NextResponse } from "next/server";
import * as btg from "@/lib/integrations/btg";
import { guardAdminApi } from "@/lib/api-admin-guard";

export async function GET() {
  const negado = await guardAdminApi("btg/test");
  if (negado) return negado;

  const result = await btg.testConnection();
  return NextResponse.json(result, { status: result.success ? 200 : 400 });
}
