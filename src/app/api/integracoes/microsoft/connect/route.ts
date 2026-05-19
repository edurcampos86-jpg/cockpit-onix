import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import {
  createOAuthState,
  MICROSOFT_OAUTH_NONCE_COOKIE,
  MICROSOFT_OAUTH_NONCE_TTL_SECONDS,
  getMicrosoftAuthUrlForUser,
  getRedirectUri,
} from "@/lib/integrations/microsoft-user-oauth";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * GET /api/integracoes/microsoft/connect
 * Inicia o OAuth Microsoft (Graph: Calendar + Mail) para o usuário logado.
 */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const limit = checkRateLimit(session.userId, "microsoft.connect", 10);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Muitas tentativas de conexão. Aguarde alguns minutos." },
      { status: 429 },
    );
  }

  try {
    const { state, nonce } = await createOAuthState(session.userId);
    const redirectUri = getRedirectUri(request);
    const authUrl = getMicrosoftAuthUrlForUser(state, redirectUri);

    const jar = await cookies();
    jar.set(MICROSOFT_OAUTH_NONCE_COOKIE, nonce, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/api/integracoes/microsoft",
      maxAge: MICROSOFT_OAUTH_NONCE_TTL_SECONDS,
    });

    return NextResponse.json({ authUrl, redirectUri });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao iniciar OAuth";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
