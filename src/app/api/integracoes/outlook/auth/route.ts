import { NextRequest, NextResponse } from "next/server";
import { getIntegrationConfig } from "@/lib/integrations/config";
import { getAuthUrl } from "@/lib/integrations/outlook";

/**
 * GET /api/integracoes/outlook/auth
 * Retorna a URL de autorização OAuth do Microsoft Graph
 */
export async function GET(request: NextRequest) {
  try {
    const config = await getIntegrationConfig();
    const clientId = config.MICROSOFT_CLIENT_ID;
    const tenantId = config.MICROSOFT_TENANT_ID || "common";

    if (!clientId) {
      return NextResponse.json(
        { error: "MICROSOFT_CLIENT_ID não configurado" },
        { status: 400 }
      );
    }

    const origin = request.nextUrl.origin;
    const redirectUri = `${origin}/api/integracoes/outlook/callback`;
    const authUrl = getAuthUrl(redirectUri, clientId, tenantId);

    return NextResponse.json({ authUrl, redirectUri });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro" },
      { status: 500 }
    );
  }
}
