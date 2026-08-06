import { NextResponse } from "next/server";
import * as manychat from "@/lib/integrations/manychat";
import { guardAdminApi } from "@/lib/api-admin-guard";

export async function GET() {
  const negado = await guardAdminApi("manychat/test");
  if (negado) return negado;

  const result = await manychat.testConnection();
  return NextResponse.json(result, { status: result.success ? 200 : 400 });
}
