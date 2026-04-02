import { NextRequest, NextResponse } from "next/server";
import { getIntegrationConfig } from "@/lib/integrations/config";
import { getGoogleAuthUrl } from "@/lib/integrations/google-calendar";

/**
 * GET /api/integracoes/google/auth
 * Retorna a URL de autorização OAuth do Google Calendar
 */
export async function GET(request: NextRequest) {
  try {
    const config = await getIntegrationConfig();
    const clientId = config.GOOGLE_CLIENT_ID;
    const clientSecret = config.GOOGLE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return NextResponse.json(
        { error: "GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET não configurados" },
        { status: 400 }
      );
    }

    // Em produção (Railway), request.nextUrl.origin retorna localhost
    const forwardedHost = request.headers.get("x-forwarded-host");
    const forwardedProto = request.headers.get("x-forwarded-proto") || "https";
    const origin = forwardedHost
      ? `${forwardedProto}://${forwardedHost}`
      : (process.env.RAILWAY_PUBLIC_DOMAIN
        ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
        : request.nextUrl.origin);
    const redirectUri = `${origin}/api/integracoes/google/callback`;
    const authUrl = getGoogleAuthUrl(redirectUri, clientId, clientSecret);

    return NextResponse.json({ authUrl, redirectUri });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro" },
      { status: 500 }
    );
  }
}
