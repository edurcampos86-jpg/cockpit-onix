import { NextResponse } from "next/server";
import {
  exchangeCodeForUser,
  getRedirectUri,
  resolveOrigin,
  verifyOAuthState,
} from "@/lib/integrations/google-user-oauth";

/**
 * GET /api/integracoes/google/connect-callback
 * Callback do OAuth multi-usuário (novo fluxo Painel do Dia).
 * O `state` carrega o userId assinado, evitando depender da sessão neste GET
 * (que pode vir sem cookie em alguns browsers/popups).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");
  const origin = resolveOrigin(request);

  const redirectError = (msg: string) =>
    NextResponse.redirect(
      new URL(`/integracoes?google_error=${encodeURIComponent(msg)}`, origin),
    );

  if (oauthError) return redirectError(oauthError);
  if (!code) return redirectError("missing_code");
  if (!state) return redirectError("missing_state");

  const decoded = await verifyOAuthState(state);
  if (!decoded) return redirectError("invalid_state");

  try {
    const redirectUri = getRedirectUri(request);
    const { email } = await exchangeCodeForUser(decoded.userId, code, redirectUri);
    return NextResponse.redirect(
      new URL(
        `/integracoes?google=connected&google_email=${encodeURIComponent(email)}`,
        origin,
      ),
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "erro_desconhecido";
    return redirectError(msg);
  }
}
