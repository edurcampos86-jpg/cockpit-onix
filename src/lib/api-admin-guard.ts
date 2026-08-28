import "server-only";
import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-helpers";
import { isAdmin, isAdminMaster } from "@/lib/rbac-papeis";

/**
 * Guarda de admin para rotas de API — espelha `guardCron` (cron-guard.ts):
 * devolve a resposta de recusa, ou `null` quando pode seguir.
 *
 * Por que existe: o middleware (`src/proxy.ts`) só garante que existe SESSÃO.
 * Ele nunca checou role, e `User.role` nasce "support" por padrão — então toda
 * rota que só confiava no middleware estava aberta a qualquer pessoa do time.
 * Repetir `getAuthContext().catch(...)` + `isAdmin` em cada arquivo convida à
 * divergência (foi assim que a inconsistência apareceu); com um helper, a
 * correção é a mesma linha em todo lugar e um grep encontra quem não a tem.
 *
 * FALHA FECHADA: sessão ausente, sessão inválida ou erro ao resolver o contexto
 * resultam em recusa. Nunca deixa passar por não conseguir decidir.
 *
 * Responde 403 em ambos os casos, com corpos distintos: nos logs dá para
 * separar "não tem sessão" de "tem sessão mas não é admin", sem que o cliente
 * consiga usar a diferença para enumerar nada.
 */
export async function guardAdminApi(
  contexto: string,
): Promise<NextResponse | null> {
  const ctx = await getAuthContext().catch(() => null);

  if (!ctx) {
    return NextResponse.json({ error: "nao_autenticado" }, { status: 403 });
  }
  if (!isAdmin(ctx)) {
    // Log da tentativa: quem, quando, onde. Acesso negado a rota
    // administrativa é sinal de conta comprometida ou permissão mal
    // atribuída — sem registro, não há como notar o padrão.
    console.warn(
      `[guard-admin] acesso NEGADO · rota=${contexto} · usuario=${ctx.userId}` +
        ` (${ctx.email}, role=${ctx.role}) · ${new Date().toISOString()}`,
    );
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return null;
}

/**
 * Guard de ADMIN MASTER — para as portas que admin comum perdeu.
 *
 * Vive ao lado de `guardAdminApi` em vez de substituí-lo porque os dois têm
 * público diferente e isso é a decisão, não um detalhe: importar planilha,
 * testar integração e editar perfil continuam sendo trabalho de admin. Ligar e
 * desligar flag, conceder acesso, exportar e apagar em massa não.
 *
 * Trocar o corpo de `guardAdminApi` fecharia de uma vez as quinze rotas que o
 * usam — inclusive as de importação, que a regra manda deixar abertas.
 */
export async function guardAdminMasterApi(
  contexto: string,
): Promise<NextResponse | null> {
  const ctx = await getAuthContext().catch(() => null);

  if (!ctx) {
    return NextResponse.json({ error: "nao_autenticado" }, { status: 403 });
  }
  if (!isAdminMaster(ctx)) {
    // Mesmo registro do guard de admin, e aqui ele importa mais: negar aqui
    // significa que um ADMIN tentou algo que só o master pode.
    console.warn(
      `[guard-master] acesso NEGADO · rota=${contexto} · usuario=${ctx.userId}` +
        ` (${ctx.email}, role=${ctx.role}) · ${new Date().toISOString()}`,
    );
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return null;
}
