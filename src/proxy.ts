import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

/**
 * Allowlist de rotas públicas. Cada entrada deve ser um path EXATO
 * ou um prefixo terminado em "/" (ex.: "/onboarding/" libera apenas
 * paths que começam com esse prefixo, e não "/onboardingfoo").
 *
 * Endpoints públicos têm seus próprios mecanismos:
 *  - /api/onix-corretora/ingest        → DASHBOARD_API_SECRET (timing-safe)
 *  - /api/onix-corretora/analisar/...  → diagnóstico read-only
 *  - /api/integracoes/zapier/webhook   → ZAPIER_WEBHOOK_SECRET
 *  - /api/cron/*                       → CRON_SECRET (Bearer)
 */
const exactPublic = new Set<string>([
  "/login",
  "/api/onix-corretora/ingest",
  "/api/onix-corretora/analisar",
  "/api/onix-corretora/test-pipeline",
  "/api/onix-corretora/coletivo",
  "/api/integracoes/zapier/webhook",
]);
const prefixPublic = ["/onboarding/", "/api/cron/"];

// Extensões consideradas estáticas — checagem restritiva ao invés de
// "qualquer path com ponto", que era um vetor de bypass.
const STATIC_EXT_RE = /\.(?:ico|png|jpg|jpeg|gif|webp|svg|css|js|map|woff2?|ttf|eot|txt|xml|json|webmanifest)$/i;

const secretKey = process.env.SESSION_SECRET;
const encodedKey = new TextEncoder().encode(secretKey || "dev-only-fallback-secret-change-me");

async function verifySession(token: string) {
  try {
    const { payload } = await jwtVerify(token, encodedKey, { algorithms: ["HS256"] });
    return payload;
  } catch {
    return null;
  }
}

function isPublic(path: string): boolean {
  if (exactPublic.has(path)) return true;
  return prefixPublic.some((p) => path.startsWith(p));
}

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;

  if (isPublic(path)) {
    return NextResponse.next();
  }

  if (path.startsWith("/_next/") || path === "/favicon.ico" || STATIC_EXT_RE.test(path)) {
    return NextResponse.next();
  }

  const sessionCookie = request.cookies.get("session")?.value;

  if (!sessionCookie) {
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

  // Sanitiza headers vindos do cliente para impedir falsificação de identidade
  // através de x-user-id / x-user-role, antes de injetar os valores reais.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete("x-user-id");
  requestHeaders.delete("x-user-role");
  requestHeaders.set("x-user-id", session.userId as string);
  requestHeaders.set("x-user-role", session.role as string);

  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
