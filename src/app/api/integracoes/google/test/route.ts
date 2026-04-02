import { NextResponse } from "next/server";
import { testGoogleConnection } from "@/lib/integrations/google-calendar";

/**
 * GET /api/integracoes/google/test
 * Testa a conexão com o Google Calendar
 */
export async function GET() {
  const result = await testGoogleConnection();
  return NextResponse.json(result);
}
