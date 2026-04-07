import { NextResponse } from "next/server";
import * as btg from "@/lib/integrations/btg";

export async function GET() {
  const result = await btg.testConnection();
  return NextResponse.json(result, { status: result.success ? 200 : 400 });
}
