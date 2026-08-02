import { NextResponse } from "next/server";
import { getAuthContext, isAdmin } from "@/lib/auth-helpers";
import { dispararLembreteCadastro } from "@/lib/lembrete-cadastro";

/**
 * Dispara o lembrete de cadastro pendente nos três canais.
 *
 *   POST /api/time/lembrete-cadastro            → DRY-RUN (não envia nada)
 *   POST /api/time/lembrete-cadastro?enviar=1   → envia de verdade
 *
 * Dry-run é o PADRÃO, não uma opção. Este endpoint manda WhatsApp e e-mail para
 * o time inteiro: um disparo por engano não tem desfazer, e "clicou sem querer"
 * é exatamente como isso acontece. Ver o que sairia primeiro custa um request.
 *
 * Admin-only: é comunicação em nome da empresa, e o e-mail sai da conta Google
 * de quem dispara.
 */
export async function POST(req: Request) {
  const ctx = await getAuthContext();
  if (!isAdmin(ctx)) {
    return NextResponse.json({ error: "apenas_admin" }, { status: 403 });
  }

  const enviar = new URL(req.url).searchParams.get("enviar") === "1";

  // O link do lembrete precisa ser clicável fora do Cockpit (WhatsApp, e-mail),
  // então tem de ser absoluto. A origem do próprio request é a fonte mais
  // confiável — acompanha produção e preview sem variável nova.
  const baseUrl = new URL(req.url).origin;

  const resultado = await dispararLembreteCadastro({
    userIdRemetente: ctx.userId,
    baseUrl,
    dryRun: !enviar,
  });

  return NextResponse.json({
    modo: enviar ? "enviado" : "dry-run",
    ...resultado,
    ...(resultado.semCanal.length > 0
      ? { aviso: "Essas pessoas não têm telefone NEM e-mail utilizável — cutuque à mão." }
      : {}),
  });
}
