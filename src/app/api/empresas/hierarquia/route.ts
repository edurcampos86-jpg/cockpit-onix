/**
 * /api/empresas/hierarquia
 *
 *   GET  → contagem e árvore de `Empresa`. Read-only.
 *   POST → cria a raiz "Onix Co" se ela ainda não existir. Idempotente.
 *
 * Existe para que o bootstrap da hierarquia seja verificável (e executável)
 * pelo navegador, sem terminal e sem DATABASE_URL na mão.
 *
 * A lógica NÃO mora aqui: `src/lib/empresas/seed-hierarquia.ts` é a fonte
 * única, compartilhada com `scripts/seed-empresas.ts`. Esta rota autentica,
 * chama e serializa.
 *
 * ── O QUE O POST NÃO FAZ ─────────────────────────────────────────────────
 * Não faz reparenting: nenhuma empresa passa a apontar para a raiz por aqui.
 * Não cria as outras 7 — para isso existe o script, onde a conferência é
 * humana. Não há UPDATE nem DELETE em nenhum caminho desta rota; a única
 * escrita é um create condicional (`createMany` com `skipDuplicates`).
 *
 * ── GATE DE AUTORIZAÇÃO ──────────────────────────────────────────────────
 * O mesmo de `api/backoffice/recon-identidade`: `isAdmin(ctx)` de
 * `@/lib/auth-helpers`, respondendo 403. Admin estrito — `teamRole`
 * "lideranca" não passa. Vale para GET e POST.
 */
import { NextResponse } from "next/server";
import { unstable_noStore as noStore } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getAuthContext, isAdmin } from "@/lib/auth-helpers";
import {
  ONIX_CO,
  conferirRaiz,
  contarEmpresas,
  lerArvore,
  semearRaiz,
} from "@/lib/empresas/seed-hierarquia";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

export async function GET() {
  // A árvore só serve se refletir o banco AGORA: o ponto do endpoint é
  // confirmar que a raiz entrou. Uma resposta de cache responderia a pergunta
  // de antes do POST com cara de resposta de depois.
  noStore();

  const ctx = await getAuthContext().catch(() => null);
  if (!ctx || !isAdmin(ctx)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const [total, arvore] = await Promise.all([contarEmpresas(prisma), lerArvore(prisma)]);
    return NextResponse.json({
      total,
      arvore,
      raiz: conferirRaiz(arvore),
      // Esperado 0 até a PR de reparenting. Explicitado para quem lê a resposta
      // não confundir "hierarquia ainda plana" com "bootstrap incompleto".
      comPai: arvore.filter((e) => e.parentId !== null).length,
    });
  } catch (e) {
    // A mensagem do driver pode conter a connection string, logo credencial:
    // vai para o log do servidor, e o cliente recebe só o código.
    console.error("[empresas/hierarquia] GET falhou:", e);
    return NextResponse.json({ error: "erro ao ler hierarquia" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  noStore();

  const ctx = await getAuthContext().catch(() => null);
  if (!ctx || !isAdmin(ctx)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Confirmação explícita no corpo. É a diferença entre um GET curioso e uma
  // escrita: sem isso, um POST acidental (form, retry de proxy, curl copiado
  // pela metade) criaria linha em produção sem ninguém ter decidido.
  let confirmar: unknown;
  try {
    const body: unknown = await request.json();
    confirmar =
      typeof body === "object" && body !== null
        ? (body as Record<string, unknown>).confirmar
        : undefined;
  } catch {
    // Corpo ausente ou JSON inválido cai no mesmo 400 de "não confirmado" —
    // para o chamador, ambos significam "esta requisição não vai escrever".
    confirmar = undefined;
  }

  if (confirmar !== true) {
    return NextResponse.json(
      {
        error: "confirmacao_ausente",
        mensagem: 'Envie { "confirmar": true } no corpo para criar a raiz.',
      },
      { status: 400 },
    );
  }

  try {
    // Rastro de QUEM e QUANDO. Esta rota escreve em produção; sem isto, "quem
    // criou a raiz?" não teria resposta — e o schema de Empresa não tem campo
    // de autoria para carregar esse dado.
    const quando = new Date().toISOString();
    console.log(
      `[empresas/hierarquia] POST bootstrap da raiz "${ONIX_CO.id}" ` +
        `por userId=${ctx.userId} (${ctx.email || "sem email"}), pessoaId=${ctx.pessoa?.id ?? "sem pessoa"} em ${quando}`,
    );

    const r = await semearRaiz(prisma);

    console.log(
      `[empresas/hierarquia] resultado=${r.resultado} inseridas=${r.inseridas} ` +
        `total=${r.totalDepois} comPai=${r.comPai}`,
    );

    return NextResponse.json({
      resultado: r.resultado,
      raizSolicitada: ONIX_CO,
      inseridas: r.inseridas,
      totalAntes: r.totalAntes,
      totalDepois: r.totalDepois,
      arvore: r.arvore,
      raiz: conferirRaiz(r.arvore),
      comPai: r.comPai,
      executadoEm: quando,
      observacao:
        "Nenhum reparenting foi feito e nenhuma outra empresa foi criada. " +
        "comPai = 0 é o estado esperado nesta fase.",
    });
  } catch (e) {
    console.error("[empresas/hierarquia] POST falhou:", e);
    return NextResponse.json({ error: "erro ao criar a raiz" }, { status: 500 });
  }
}
