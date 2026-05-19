import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  exchangeCodeForUser,
  GOOGLE_OAUTH_NONCE_COOKIE,
  getRedirectUri,
  resolveOrigin,
  verifyOAuthState,
} from "@/lib/integrations/google-user-oauth";

/**
 * GET /api/integracoes/google/connect-callback
 * Callback do OAuth multi-usuário (novo fluxo Painel do Dia).
 *
 * Segurança:
 *  - O `state` carrega userId + nonce assinados (HS256, TTL 10min).
 *  - O nonce também é setado num cookie httpOnly em /connect; aqui
 *    exigimos que os dois batam (double-submit). Isso impede replay
 *    de state capturado mesmo dentro da janela de validade.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");
  const origin = resolveOrigin(request);

  const jar = await cookies();
  const cookieNonce = jar.get(GOOGLE_OAUTH_NONCE_COOKIE)?.value ?? null;
  // Sempre limpa o cookie (single-use) — usa o mesmo path que foi setado
  jar.set(GOOGLE_OAUTH_NONCE_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/integracoes/google",
    maxAge: 0,
  });

  const redirectError = (msg: string) =>
    NextResponse.redirect(
      new URL(`/integracoes?google_error=${encodeURIComponent(msg)}`, origin),
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
      new URL(`/integracoes?google=connected`, origin),
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "erro_desconhecido";
    return redirectError(msg);
  }
}
