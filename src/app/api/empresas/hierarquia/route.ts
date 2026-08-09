/**
 * /api/empresas/hierarquia
 *
 *   GET  → contagem e árvore de `Empresa`. Read-only.
 *   POST → duas ações, escolhidas por `acao` no corpo:
 *            (padrão)   cria a raiz "Onix Co" se ainda não existir. Idempotente.
 *            "reparent" pendura as 7 empresas na raiz — `modo: "dry-run"` mostra
 *                       o plano sem escrever; `modo: "aplicar"` executa.
 *
 * Existe para que o bootstrap E o reparenting sejam verificáveis e executáveis
 * pelo navegador, sem terminal e sem DATABASE_URL na mão.
 *
 * A lógica NÃO mora aqui. `src/lib/empresas/seed-hierarquia.ts` é a fonte do
 * seed (compartilhada com `scripts/seed-empresas.ts`) e
 * `src/lib/empresas/reparent.ts` é a do reparenting (compartilhada com
 * `scripts/reparent-empresas.ts`). Esta rota autentica, chama e serializa.
 *
 * ── O QUE O POST NÃO FAZ ─────────────────────────────────────────────────
 * A ação padrão não cria as outras 7 — para isso existe o script, onde a
 * conferência é humana — e não faz reparenting. A ação "reparent" não cria
 * empresa, não renomeia, não apaga e não toca em `PessoaEmpresa`: o único
 * UPDATE que existe nesta rota é o `parentId`, e só no modo "aplicar".
 * Nenhum caminho faz DELETE.
 *
 * ── COMPATIBILIDADE ──────────────────────────────────────────────────────
 * `{ confirmar: true }` sem `acao` continua fazendo exatamente o que fazia:
 * criar a raiz. A ação nova é opt-in por campo novo; nenhum chamador existente
 * muda de comportamento.
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
import { idsFilhasDaRaiz } from "@/lib/empresas/catalogo";
import {
  PreCondicaoReparent,
  aplicarPlano,
  carregarArvore,
  conferirContraCatalogo,
  planejarReparent,
} from "@/lib/empresas/reparent";

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
  let acao: unknown;
  let modo: unknown;
  try {
    const body: unknown = await request.json();
    const obj = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
    confirmar = obj.confirmar;
    acao = obj.acao;
    modo = obj.modo;
  } catch {
    // Corpo ausente ou JSON inválido cai no mesmo 400 de "não confirmado" —
    // para o chamador, ambos significam "esta requisição não vai escrever".
    confirmar = undefined;
  }

  if (confirmar !== true) {
    return NextResponse.json(
      {
        error: "confirmacao_ausente",
        mensagem: 'Envie { "confirmar": true } no corpo. Para o reparenting, some ' +
          '{ "acao": "reparent", "modo": "dry-run" | "aplicar" }.',
      },
      { status: 400 },
    );
  }

  // Ação desconhecida é erro do chamador, não "faz o padrão". Cair no default
  // silenciosamente faria um `acao: "reparente"` (typo) criar a raiz sem avisar.
  if (acao !== undefined && acao !== "reparent") {
    return NextResponse.json(
      {
        error: "acao_desconhecida",
        mensagem: `"${String(acao)}" não é uma ação. Omita o campo para criar a raiz, ` +
          'ou use "reparent".',
      },
      { status: 400 },
    );
  }

  if (acao === "reparent") {
    return reparent(request, ctx, modo);
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

/**
 * `acao: "reparent"` — pendura as 7 empresas na raiz.
 *
 * A lógica é a de `src/lib/empresas/reparent.ts`, a mesma que
 * `scripts/reparent-empresas.ts` consome. Aqui só se traduz modo → chamada e
 * resultado → JSON.
 *
 * ── O DRY-RUN NÃO PODE ESCREVER ──────────────────────────────────────────
 * `planejarReparent` é função PURA e `aplicarPlano` é a única que escreve. No
 * modo "dry-run" a segunda simplesmente não é chamada — não existe caminho em
 * que ela escreva "por engano". Isso é propriedade do módulo, não deste if.
 *
 * ── AUTOR É O DA SESSÃO ──────────────────────────────────────────────────
 * Diferente do script, que precisa de `--como`, aqui o autor já está
 * autenticado: `ctx.userId`. É a vantagem de rodar pelo navegador — não há
 * como informar um autor que não seja você.
 */
async function reparent(
  request: Request,
  ctx: { userId: string; pessoa: { id: string } | null },
  modo: unknown,
): Promise<Response> {
  if (modo !== "dry-run" && modo !== "aplicar") {
    return NextResponse.json(
      {
        error: "modo_invalido",
        mensagem: 'Informe "modo": "dry-run" (mostra o plano, não escreve) ou "aplicar".',
      },
      { status: 400 },
    );
  }

  try {
    // Guardas de pré-condição: tabela ausente, tabela vazia e raiz ausente têm
    // consertos diferentes, e cada uma responde com a instrução da sua.
    const empresas = await carregarArvore(prisma);
    conferirContraCatalogo(idsFilhasDaRaiz());

    const plano = planejarReparent(empresas);

    // Plano que produziria nível 3 é recusado ANTES de qualquer escrita — a
    // régua é a mesma de `hierarquia.ts`, travada por hierarquia.test.ts.
    if (plano.problemas.length > 0) {
      return NextResponse.json(
        {
          error: "arvore_fora_da_regua",
          mensagem: "O plano produziria uma árvore fora da régua de 2 níveis. Nada foi escrito.",
          problemas: plano.problemas,
          plano: plano.movimentos,
        },
        { status: 409 },
      );
    }

    if (modo === "dry-run") {
      return NextResponse.json({
        acao: "reparent",
        modo,
        escreveu: false,
        raiz: plano.raiz,
        plano: plano.movimentos,
        totais: plano.totais,
        arvoreSimulada: plano.arvoreResultante,
        observacao:
          "Nada foi escrito. Para executar, repita com { \"modo\": \"aplicar\" }.",
      });
    }

    const quando = new Date().toISOString();
    console.log(
      `[empresas/hierarquia] reparent APLICAR por userId=${ctx.userId} em ${quando} — ` +
        `${plano.totais.mover} movimento(s) planejado(s)`,
    );

    const r = await aplicarPlano(prisma, plano, {
      autorId: ctx.userId,
      origem: "api/empresas/hierarquia",
    });

    return NextResponse.json({
      acao: "reparent",
      modo,
      escreveu: true,
      raiz: plano.raiz,
      movidas: r.movidas,
      plano: plano.movimentos,
      totais: plano.totais,
      // Relida do banco DEPOIS das escritas, não a simulada: se um UPDATE não
      // pegou, é aqui que aparece.
      arvoreFinal: r.arvoreFinal,
      problemas: r.problemas,
      auditadas: r.auditadas,
      falhasDeLog: r.falhasDeLog,
      executadoEm: quando,
      observacao:
        r.falhasDeLog > 0
          ? "Reparenting aplicado, mas parte do rastro não gravou: o dado está correto e o histórico ficou incompleto."
          : "Reparenting aplicado e auditado.",
    });
  } catch (e) {
    // Pré-condição tem mensagem instrutiva e é segura de devolver — foi escrita
    // para o operador ler. Qualquer outro erro pode carregar connection string,
    // então vai só para o log do servidor.
    if (e instanceof PreCondicaoReparent) {
      return NextResponse.json({ error: e.codigo, mensagem: e.message }, { status: 409 });
    }
    console.error("[empresas/hierarquia] reparent falhou:", e);
    return NextResponse.json({ error: "erro ao executar o reparenting" }, { status: 500 });
  }
}
