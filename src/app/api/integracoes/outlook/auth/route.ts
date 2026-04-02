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

    // Em produção (Railway), request.nextUrl.origin retorna localhost
    // Usar x-forwarded-host ou RAILWAY_PUBLIC_DOMAIN para obter a URL real
    const forwardedHost = request.headers.get("x-forwarded-host");
    const forwardedProto = request.headers.get("x-forwarded-proto") || "https";
    const origin = forwardedHost
      ? `${forwardedProto}://${forwardedHost}`
      : (process.env.RAILWAY_PUBLIC_DOMAIN
        ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
        : request.nextUrl.origin);
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
