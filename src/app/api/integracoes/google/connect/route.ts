import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import {
  createOAuthState,
  getGoogleAuthUrlForUser,
  getRedirectUri,
} from "@/lib/integrations/google-user-oauth";

/**
 * GET /api/integracoes/google/connect
 * Inicia o OAuth do Google (Calendar + Gmail) para o usuário logado.
 * Retorna a URL de consentimento — o client abre em popup/aba.
 */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  try {
    const state = await createOAuthState(session.userId);
    const redirectUri = getRedirectUri(request);
    const authUrl = getGoogleAuthUrlForUser(state, redirectUri);
    return NextResponse.json({ authUrl, redirectUri });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao iniciar OAuth";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
