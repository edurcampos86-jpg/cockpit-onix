import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { ehEstaticoSemAuth, ehRotaPublica } from "@/lib/proxy-rotas";

/**
 * As duas regras de path vivem em `@/lib/proxy-rotas` (módulo puro, testado).
 * Este arquivo importa `jose` e `next/server`, então a lógica que decide quem
 * pula a autenticação não tinha como ter teste — e foi exatamente ali que o
 * furo do `path.includes(".")` morou sem ninguém notar. Comentário de cada
 * rota pública está no módulo.
 */
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

/**
 * Drena (lê e descarta) o corpo da request antes de responder cedo.
 *
 * Necessário para métodos com corpo (POST/PUT/PATCH): responder — mesmo com
 * um 401 JSON — sem consumir o corpo de um upload em curso (ex.: multipart de
 * vários MB no /api/juridico/contratos/upload) faz o Next/Node resetar a
 * conexão. O cliente vê "Failed to fetch" (sem conseguir ler a resposta) e o
 * servidor loga "aborted"/ECONNRESET. Drenando primeiro, o upload termina e o
 * fetch recebe o 401 normalmente. Só entra aqui quando vamos curto-circuitar
 * a request (nunca em NextResponse.next()), então consumir o corpo é seguro.
 */
async function drenarCorpoRequest(request: NextRequest) {
  if (!request.body) return;
  try {
    const reader = request.body.getReader();
    // Lê chunk a chunk e descarta — evita bufferizar os 20 MB em memória.
    while (!(await reader.read()).done) {
      /* descarta */
    }
  } catch {
    // Cliente já abortou ou corpo indisponível — nada a drenar.
  }
}

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // Rotas públicas (cada uma com autenticação própria) e estáticos/internos.
  if (ehRotaPublica(path) || ehEstaticoSemAuth(path)) {
    return NextResponse.next();
  }

  // Check session cookie
  const sessionCookie = request.cookies.get("session")?.value;

  if (!sessionCookie) {
    // Para rotas de API, retornar 401 em vez de redirect
    if (path.startsWith("/api/")) {
      // Drena o corpo antes do 401 — senão o upload em curso é cortado no
      // meio e o cliente recebe "aborted"/ECONNRESET em vez deste 401 JSON.
      await drenarCorpoRequest(request);
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const session = await verifySession(sessionCookie);

  if (!session) {
    const isApi = path.startsWith("/api/");
    if (isApi) {
      // Drena o corpo antes do 401 — mesmo motivo do branch de sessão ausente.
      await drenarCorpoRequest(request);
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
        // Drena o corpo antes do 401 — senão o upload em curso é cortado no
        // meio e o cliente recebe "aborted"/ECONNRESET em vez deste 401 JSON.
        await drenarCorpoRequest(request);
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
