import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import {
  createOAuthState,
  GOOGLE_OAUTH_NONCE_COOKIE,
  GOOGLE_OAUTH_NONCE_TTL_SECONDS,
  getGoogleAuthUrlForUser,
  getRedirectUri,
} from "@/lib/integrations/google-user-oauth";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * GET /api/integracoes/google/connect
 * Inicia o OAuth do Google (Calendar + Gmail) para o usuário logado.
 * Retorna a URL de consentimento — o client redireciona.
 */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  // Rate limit defensivo (10/h é mais do que suficiente pra conectar)
  const limit = checkRateLimit(session.userId, "google.connect", 10);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Muitas tentativas de conexão. Aguarde alguns minutos." },
      { status: 429 },
    );
  }

  try {
    const { state, nonce } = await createOAuthState(session.userId);
    const redirectUri = getRedirectUri(request);
    const authUrl = getGoogleAuthUrlForUser(state, redirectUri);

    const jar = await cookies();
    jar.set(GOOGLE_OAUTH_NONCE_COOKIE, nonce, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/api/integracoes/google",
      maxAge: GOOGLE_OAUTH_NONCE_TTL_SECONDS,
    });

    return NextResponse.json({ authUrl, redirectUri });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao iniciar OAuth";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
