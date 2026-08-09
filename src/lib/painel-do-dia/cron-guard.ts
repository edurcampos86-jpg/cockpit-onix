import "server-only";
import { NextResponse } from "next/server";

/**
 * Cron guard: valida `Authorization: Bearer <CRON_SECRET>` no header.
 *
 * Protege as 19 rotas em /api/cron/*, disparadas por
 * .github/workflows/cron.yml. CRON_SECRET vive nas Variables do Railway e
 * precisa ser idêntico ao secret de mesmo nome no GitHub Actions.
 *
 * FALHA FECHADA. Sem CRON_SECRET configurado, tudo é bloqueado.
 *
 * Antes, a ausência da variável devolvia `null` — ou seja, DESLIGAVA a
 * guarda. A intenção era conveniência de dev, mas o efeito em produção era
 * o oposto do pretendido: se a variável sumisse do Railway, ou fosse
 * renomeada num deploy, as 19 rotas de cron viravam públicas e sem
 * autenticação nenhuma — incluindo as que escrevem no banco e as que
 * disparam backup. E não haveria sintoma: tudo continuaria respondendo 200.
 *
 * Consequência para dev local: agora é preciso definir CRON_SECRET (qualquer
 * valor) no .env para chamar essas rotas à mão. Isso é deliberado — uma
 * guarda que se desliga sozinha quando a config falta não é uma guarda.
 */
/**
 * O chamador apresentou o CRON_SECRET correto? Booleano, sem montar resposta.
 *
 * Serve quem precisa DECIDIR em vez de recusar: `/api/health` usa isto para
 * acrescentar o estado das flags só a chamador autenticado, mantendo a resposta
 * pública idêntica em vez de responder 403. `guardCron` continua sendo o
 * caminho de quem deve recusar.
 *
 * Mesma falha fechada da guarda: sem CRON_SECRET configurado, ninguém é
 * autorizado.
 */
export function cronAutorizado(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const auth = request.headers.get("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  return token === secret;
}

export function guardCron(request: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET?.trim();

  if (!secret) {
    // Erro de configuração do servidor, não do chamador. O corpo é distinto
    // do "forbidden" abaixo de propósito: nos logs do workflow dá pra separar
    // "o servidor não tem segredo" de "o token enviado não bate".
    console.error(
      "CRON_SECRET não configurado — endpoint bloqueado por padrão seguro",
    );
    return NextResponse.json(
      { error: "cron_secret_nao_configurado" },
      { status: 403 },
    );
  }

  const auth = request.headers.get("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  if (token !== secret) {
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
