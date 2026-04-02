import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens } from "@/lib/integrations/google-calendar";

/**
 * GET /api/integracoes/google/callback
 * Callback do OAuth2 do Google Calendar
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const error = request.nextUrl.searchParams.get("error");

  // Detectar origin real (Railway proxy)
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto") || "https";
  const origin = forwardedHost
    ? `${forwardedProto}://${forwardedHost}`
    : (process.env.RAILWAY_PUBLIC_DOMAIN
      ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
      : request.nextUrl.origin);

  if (error) {
    return NextResponse.redirect(
      new URL(`/integracoes?error=${encodeURIComponent(error)}`, origin)
    );
  }

  if (!code) {
    return NextResponse.redirect(
      new URL("/integracoes?error=no_code", origin)
    );
  }

  try {
    const redirectUri = `${origin}/api/integracoes/google/callback`;
    await exchangeCodeForTokens(code, redirectUri);

    return NextResponse.redirect(
      new URL("/integracoes?google=connected", origin)
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro";
    return NextResponse.redirect(
      new URL(`/integracoes?error=${encodeURIComponent(msg)}`, origin)
    );
  }
}
