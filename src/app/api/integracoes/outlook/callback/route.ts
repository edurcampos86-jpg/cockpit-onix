import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens } from "@/lib/integrations/outlook";

/**
 * GET /api/integracoes/outlook/callback
 * Callback do OAuth2 do Microsoft Graph
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const error = request.nextUrl.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      new URL(`/integracoes?error=${encodeURIComponent(error)}`, request.url)
    );
  }

  if (!code) {
    return NextResponse.redirect(
      new URL("/integracoes?error=no_code", request.url)
    );
  }

  try {
    // Em produção (Railway), request.nextUrl.origin retorna localhost
    const forwardedHost = request.headers.get("x-forwarded-host");
    const forwardedProto = request.headers.get("x-forwarded-proto") || "https";
    const origin = forwardedHost
      ? `${forwardedProto}://${forwardedHost}`
      : (process.env.RAILWAY_PUBLIC_DOMAIN
        ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
        : request.nextUrl.origin);
    const redirectUri = `${origin}/api/integracoes/outlook/callback`;
    await exchangeCodeForTokens(code, redirectUri);

    return NextResponse.redirect(
      new URL("/integracoes?outlook=connected", request.url)
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro";
    return NextResponse.redirect(
      new URL(`/integracoes?error=${encodeURIComponent(msg)}`, request.url)
    );
  }
}
