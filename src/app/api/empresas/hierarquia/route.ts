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
    const [total, arvore, ultimosBootstraps] = await Promise.all([
      contarEmpresas(prisma),
      lerArvore(prisma),
      // Auditoria sem leitor só descobre que não funciona no dia em que alguém
      // precisa dela — foi o que aconteceu com PapelPermissao, que tem UI de
      // edição e nenhum consumidor. Expor aqui é o menor caminho para o log
      // ter uso: mesma rota, mesmo gate, mesma tabela.
      //
      // `select` explícito e MÍNIMO: só quem, quando e o desfecho. ipAddress,
      // userAgent e metadata NÃO saem — são dado de rastreamento, não fazem
      // falta para responder "quem criou a raiz?", e uma resposta de API é
      // colável em ticket, chat e print.
      prisma.empresaBootstrapLog.findMany({
        orderBy: { timestamp: "desc" },
        take: 10,
        select: {
          id: true,
          acao: true,
          resultado: true,
          empresaId: true,
          timestamp: true,
          usuario: { select: { id: true, name: true } },
        },
      }),
    ]);
    return NextResponse.json({
      total,
      arvore,
      raiz: conferirRaiz(arvore),
      ultimosBootstraps,
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
    const quando = new Date().toISOString();

    const r = await semearRaiz(prisma);

    // Rastro imutável de QUEM e QUANDO, no padrão de ContratoAcessoLog. Antes
    // isto era só `console.log`, que rotaciona e não é consultável pela tela:
    // depois de a raiz existir, "quem criou e quando?" ficava sem resposta, e
    // o model Empresa não tem campo de autoria para carregar o dado.
    //
    // Grava TODA chamada que passou pelo gate, inclusive a que não criou nada
    // (resultado "ja_existia") — log só do caso feliz responderia "quem criou"
    // mas nunca "quem tentou".
    //
    // DEFENSIVO: falha ao gravar o log NÃO derruba a resposta. A semeadura já
    // aconteceu e é idempotente; devolver 500 aqui faria o chamador repetir uma
    // operação que deu certo, e a repetição não corrige o log perdido. O erro
    // vai para o stderr do servidor e a resposta sinaliza em `auditado`.
    let auditado = true;
    try {
      await prisma.empresaBootstrapLog.create({
        data: {
          usuarioId: ctx.userId,
          acao: "bootstrap_raiz",
          resultado: r.resultado,
          empresaId: ONIX_CO.id,
          ipAddress:
            request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
            request.headers.get("x-real-ip"),
          userAgent: request.headers.get("user-agent"),
          metadata: {
            totalAntes: r.totalAntes,
            totalDepois: r.totalDepois,
            inseridas: r.inseridas,
            comPai: r.comPai,
            pessoaId: ctx.pessoa?.id ?? null,
            executadoEm: quando,
          },
        },
      });
    } catch (erroLog) {
      auditado = false;
      console.error("[empresas/hierarquia] falha ao gravar EmpresaBootstrapLog:", erroLog);
    }

    return NextResponse.json({
      auditado,
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
