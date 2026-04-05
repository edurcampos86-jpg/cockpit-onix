import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const publicRoutes = [
  "/login",
  "/api/onix-corretora/ingest",
  "/api/onix-corretora/analisar",      // GET diagnóstico (apenas lê flags, não expõe tokens)
  "/api/onix-corretora/test-pipeline", // Diagnóstico do pipeline
  "/api/onix-corretora/coletivo",      // Geração de relatório coletivo
  "/api/integracoes/zapier/webhook",
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
