import "server-only";
import { NextResponse } from "next/server";
import { safeEqual } from "@/lib/security/timing-safe";

/**
 * Cron guard: valida `Authorization: Bearer <CRON_SECRET>` no header.
 *
 * Default-deny: em produção, exige CRON_SECRET configurado.
 * Em dev: pode rodar aberto se CRON_DEV_OPEN=true (opt-in explícito).
 */
export function guardCron(request: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET?.trim();

  if (!secret) {
    if (process.env.NODE_ENV !== "production" && process.env.CRON_DEV_OPEN === "true") {
      return null;
    }
    return NextResponse.json({ error: "cron secret not configured" }, { status: 503 });
  }

  const auth = request.headers.get("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!safeEqual(token, secret)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return null;
}

/**
 * Executa um handler de cron para cada usuário com sessão recente.
 * Retorna um sumário agregado.
 */
export async function comTodosUsuarios<R>(
  handler: (userId: string) => Promise<R>
): Promise<{ ok: number; err: number; detalhes: Array<{ userId: string; ok: boolean; erro?: string }> }> {
  const { prisma } = await import("@/lib/prisma");
  const users = await prisma.user.findMany({ select: { id: true } });

  const detalhes: Array<{ userId: string; ok: boolean; erro?: string }> = [];
  let ok = 0;
  let err = 0;

  for (const u of users) {
    try {
      await handler(u.id);
      ok++;
      detalhes.push({ userId: u.id, ok: true });
    } catch (e) {
      err++;
      detalhes.push({
        userId: u.id,
        ok: false,
        erro: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return { ok, err, detalhes };
}
