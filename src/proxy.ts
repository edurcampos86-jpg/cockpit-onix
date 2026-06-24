import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const publicRoutes = [
  "/login",
  "/recriar-senha",                    // Reset de senha — protegido por PASSWORD_RESET_SECRET
  "/onboarding/",                      // Rota pública de onboarding por token (Fase 2C — gestão do time)
  "/api/cron/",                        // Crons do Painel do Dia — autenticam via Bearer CRON_SECRET
  "/api/health",                       // Health check do smoke pós-deploy — sem dados sensíveis
  "/api/integracoes/zapier/webhook",
  "/api/onix-corretora/ingest",
  "/api/webhooks/btg",                 // Webhook BTG — autentica via x-webhook-secret se configurado
  "/api/integracoes/meta/ingest",      // Ingest de eventos do MSP — Bearer META_INGEST_TOKEN (timing-safe; ausente = 503)
];
const secretKey = process.env.SESSION_SECRET;
const encodedKey = new TextEncoder().encode(secretKey);

async function verifySession(token: string) {
  try {
    const { payload } = await jwtVerify(token, encodedKey, {
      algorithms: ["HS256"],
    });
    return payload;
  } catch {
    return null;
  }
}

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // Allow public routes
  if (publicRoutes.some((route) => path.startsWith(route))) {
    return NextResponse.next();
  }

  // Allow static files and Next.js internals
  if (
    path.startsWith("/_next") ||
    path.startsWith("/favicon") ||
    path.includes(".")
  ) {
    return NextResponse.next();
  }

  // Check session cookie
  const sessionCookie = request.cookies.get("session")?.value;

  if (!sessionCookie) {
    // Para rotas de API, retornar 401 em vez de redirect
    if (path.startsWith("/api/")) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const session = await verifySession(sessionCookie);

  if (!session) {
    const isApi = path.startsWith("/api/");
    if (isApi) {
      const response = NextResponse.json({ error: "Session expired" }, { status: 401 });
      response.cookies.delete("session");
      return response;
    }
    const response = NextResponse.redirect(new URL("/login", request.url));
    response.cookies.delete("session");
    return response;
  }

  // Gate de 2FA pro módulo Jurídico — checagem leve (só cookie). Validação
  // detalhada (userId match, expiração) acontece nos handlers via
  // verificarSessao2FA(). Esta camada apenas redireciona o usuário pra o
  // fluxo de verify se não há cookie. Rotas /2fa/* e /api/auth/2fa/* passam
  // direto pra não criar loop.
  const ehJuridico = path.startsWith("/juridico") || path.startsWith("/api/juridico");
  const eh2FA = path.startsWith("/2fa") || path.startsWith("/api/auth/2fa");
  if (ehJuridico && !eh2FA) {
    const tem2FA = request.cookies.has("2fa-verified");
    if (!tem2FA) {
      if (path.startsWith("/api/")) {
        return NextResponse.json(
          {
            error: "2FA required",
            redirect: `/2fa/verify?next=${encodeURIComponent(path)}`,
          },
          { status: 401, headers: { "X-2FA-Required": "1" } }
        );
      }
      const next = path + request.nextUrl.search;
      const url = new URL(`/2fa/verify?next=${encodeURIComponent(next)}`, request.url);
      return NextResponse.redirect(url);
    }
  }

  // Injetar userId e role no header para uso nas API routes
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-user-id", session.userId as string);
  requestHeaders.set("x-user-role", session.role as string);

  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
