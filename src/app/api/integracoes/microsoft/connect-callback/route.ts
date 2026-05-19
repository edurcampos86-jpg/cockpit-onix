import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  exchangeCodeForUser,
  MICROSOFT_OAUTH_NONCE_COOKIE,
  getRedirectUri,
  resolveOrigin,
  verifyOAuthState,
} from "@/lib/integrations/microsoft-user-oauth";

/**
 * GET /api/integracoes/microsoft/connect-callback
 * Callback do OAuth multi-usuário Microsoft (Graph).
 *
 * Mesma segurança do callback Google: state JWT assinado HS256 (TTL 10min)
 * + double-submit cookie nonce httpOnly.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");
  const origin = resolveOrigin(request);

  const jar = await cookies();
  const cookieNonce = jar.get(MICROSOFT_OAUTH_NONCE_COOKIE)?.value ?? null;
  jar.set(MICROSOFT_OAUTH_NONCE_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/integracoes/microsoft",
    maxAge: 0,
  });

  const redirectError = (msg: string) =>
    NextResponse.redirect(
      new URL(`/integracoes?microsoft_error=${encodeURIComponent(msg)}`, origin),
    );

  if (oauthError) return redirectError(oauthError);
  if (!code) return redirectError("missing_code");
  if (!state) return redirectError("missing_state");
  if (!cookieNonce) return redirectError("missing_nonce");

  const decoded = await verifyOAuthState(state, cookieNonce);
  if (!decoded) return redirectError("invalid_state");

  try {
    const redirectUri = getRedirectUri(request);
    await exchangeCodeForUser(decoded.userId, code, redirectUri);
    return NextResponse.redirect(
      new URL(`/integracoes?microsoft=connected`, origin),
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "erro_desconhecido";
    return redirectError(msg);
  }
}
