import { NextResponse } from "next/server";
import * as manychat from "@/lib/integrations/manychat";

export async function GET() {
  const result = await manychat.testConnection();
  return NextResponse.json(result, { status: result.success ? 200 : 400 });
}
