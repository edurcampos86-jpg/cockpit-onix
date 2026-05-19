import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

/**
 * GET  /api/integracoes/google/aliases
 *  -> { aliases: string[] }
 *
 * PUT  /api/integracoes/google/aliases  body: { aliases: string[] }
 *  -> { aliases: string[], saved: true }
 *
 * Aliases sao e-mails extras que "tambem sao voce" — usado pra reconhecer
 * forwards (ex.: e-mail corporativo bloqueado pela TI do banco que
 * encaminha tudo pro Gmail pessoal). Sem aliases, a heuristica
 * "destinatario direto = pede acao" falha em todos os forwards.
 *
 * Validacao: regex basico de e-mail, max 10 aliases, dedupe vs googleEmail
 * e entre si. Tudo lowercase.
 */

const EMAIL_REGEX = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;
const MAX_ALIASES = 10;

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const row = await prisma.userGoogleAuth.findUnique({
    where: { userId: session.userId },
    select: { aliases: true },
  });
  if (!row) return NextResponse.json({ error: "Google não conectado" }, { status: 404 });

  const aliases = (row.aliases ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return NextResponse.json({ aliases });
}

export async function PUT(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const row = await prisma.userGoogleAuth.findUnique({
    where: { userId: session.userId },
    select: { googleEmail: true },
  });
  if (!row) return NextResponse.json({ error: "Google não conectado" }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const input = (body as { aliases?: unknown })?.aliases;
  if (!Array.isArray(input)) {
    return NextResponse.json(
      { error: "aliases deve ser array de string" },
      { status: 400 },
    );
  }

  const normalizados = Array.from(
    new Set(
      input
        .filter((s): s is string => typeof s === "string")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    ),
  );
  // Remove o proprio googleEmail (nao faz sentido como alias)
  const googleEmailLower = row.googleEmail.toLowerCase();
  const filtrados = normalizados.filter((a) => a !== googleEmailLower);

  if (filtrados.length > MAX_ALIASES) {
    return NextResponse.json(
      { error: `Máximo ${MAX_ALIASES} aliases` },
      { status: 400 },
    );
  }
  const invalidos = filtrados.filter((a) => !EMAIL_REGEX.test(a));
  if (invalidos.length > 0) {
    return NextResponse.json(
      { error: `E-mails inválidos: ${invalidos.join(", ")}` },
      { status: 400 },
    );
  }

  const csv = filtrados.length > 0 ? filtrados.join(",") : null;
  await prisma.userGoogleAuth.update({
    where: { userId: session.userId },
    data: { aliases: csv },
  });

  return NextResponse.json({ aliases: filtrados, saved: true });
}
