/**
 * /api/empresas/hierarquia
 *
 *   GET  → contagem e árvore de `Empresa`. Read-only.
 *   POST → três ações, escolhidas por `acao` no corpo:
 *            (padrão)      cria a raiz "Onix Co" se ainda não existir. Idempotente.
 *            "seed-filhas" cria as 5 empresas jurídicas do grupo JÁ penduradas
 *                          em "onix-co". Só as ausentes; existentes ficam
 *                          intocadas e pai divergente é reportado, não corrigido.
 *            "reparent"    remaneja `parentId` de linha já existente —
 *                          `modo: "dry-run"` mostra o plano sem escrever;
 *                          `modo: "aplicar"` executa.
 *
 * Existe para que o bootstrap E o reparenting sejam verificáveis e executáveis
 * pelo navegador, sem terminal e sem DATABASE_URL na mão.
 *
 * ── AS TRÊS AÇÕES NÃO SE SOBREPÕEM ───────────────────────────────────────
 * Cada uma tem exatamente um verbo, e é isso que permite auditar o que uma
 * chamada pode ter feito só pelo nome dela:
 *
 *   padrão / seed-filhas → INSERT condicional. Nunca UPDATE.
 *   reparent             → UPDATE de `parentId`. Nunca INSERT.
 *
 * Por isso `seed-filhas` reporta divergência de pai em vez de consertar: o
 * conserto é o verbo da outra ação. Nenhum caminho desta rota faz DELETE, e
 * nenhum toca em `PessoaEmpresa`.
 *
 * A lógica NÃO mora aqui. `src/lib/empresas/seed-hierarquia.ts` é a fonte do
 * seed (compartilhada com `scripts/seed-empresas.ts`) e
 * `src/lib/empresas/reparent.ts` é a do reparenting (compartilhada com
 * `scripts/reparent-empresas.ts`). Esta rota autentica, chama e serializa.
 *
 * ── COMPATIBILIDADE ──────────────────────────────────────────────────────
 * `{ confirmar: true }` sem `acao` continua fazendo exatamente o que fazia:
 * criar a raiz, e só ela. As ações são opt-in por campo novo; nenhum chamador
 * existente muda de comportamento.
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
  EMPRESAS_DO_GRUPO,
  ONIX_CO,
  conferirRaiz,
  contarEmpresas,
  lerArvore,
  planejarSeedFilhas,
  semearFilhas,
  semearRaiz,
} from "@/lib/empresas/seed-hierarquia";
import { idsFilhasDaRaiz } from "@/lib/empresas/catalogo";
import { validarArvore } from "@/lib/empresas/hierarquia";
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
        mensagem: 'Envie { "confirmar": true } no corpo. Para semear as filhas, some ' +
          '{ "acao": "seed-filhas" }; para o reparenting, ' +
          '{ "acao": "reparent", "modo": "dry-run" | "aplicar" }.',
      },
      { status: 400 },
    );
  }

  // Ação desconhecida é erro do chamador, não "faz o padrão". Cair no default
  // silenciosamente faria um `acao: "reparente"` (typo) criar a raiz sem avisar.
  if (acao !== undefined && acao !== "reparent" && acao !== "seed-filhas") {
    return NextResponse.json(
      {
        error: "acao_desconhecida",
        mensagem: `"${String(acao)}" não é uma ação. Omita o campo para criar a raiz, ` +
          'ou use "seed-filhas" ou "reparent".',
      },
      { status: 400 },
    );
  }

  if (acao === "reparent") {
    return reparent(request, ctx, modo);
  }

  if (acao === "seed-filhas") {
    return seedFilhas(request, ctx);
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
 * `acao: "seed-filhas"` — cria as 5 empresas jurídicas do grupo já penduradas
 * em `onix-co`.
 *
 * Quem são as 5, e por que Agro / Planejamento / Contábil / Meu Sucesso
 * Patrimonial / Barreiras / Unaí NÃO estão, está escrito por extenso no topo
 * de `src/lib/empresas/catalogo.ts`. Esta função não decide lista: ela recebe
 * `EMPRESAS_DO_GRUPO` pronta.
 *
 * ── IDEMPOTENTE, E DE UM JEITO ESPECÍFICO ────────────────────────────────
 * Cria SÓ o que falta. Linha existente não é tocada — nem o nome, nem o pai.
 * Rodar dez vezes deixa as mesmas 6 linhas (raiz + 5), e da segunda chamada em
 * diante nenhuma escrita em `Empresa` acontece.
 *
 * ── DIVERGÊNCIA DE PAI É REPORTADA, NÃO CORRIGIDA ────────────────────────
 * Filha que já existe apontando para outro pai (ou solta como raiz) sai na
 * resposta em `divergencias` e fica INTACTA. Corrigir aqui seria um UPDATE
 * silencioso em produção disfarçado de "seed"; e o conserto já tem ferramenta
 * própria — `acao: "reparent"`, que mostra o plano antes de escrever. A
 * resposta diz isso em `observacao`, para quem lê o JSON saber o próximo passo
 * sem procurar.
 *
 * ── A RAIZ TEM DE EXISTIR ANTES ──────────────────────────────────────────
 * `Empresa.parentId` é FK: sem `onix-co` no banco, o INSERT das filhas falharia
 * com erro de driver. Em vez disso a pré-condição é conferida e responde 409
 * com a instrução — que é rodar a ação padrão (`{ confirmar: true }`) primeiro.
 */
async function seedFilhas(
  request: Request,
  ctx: { userId: string; pessoa: { id: string } | null },
): Promise<Response> {
  try {
    const arvore = await lerArvore(prisma);
    const plano = planejarSeedFilhas(arvore, EMPRESAS_DO_GRUPO);

    if (!plano.raizPresente) {
      return NextResponse.json(
        {
          error: "raiz_ausente",
          mensagem:
            `A raiz "${ONIX_CO.id}" não existe neste banco, e as filhas apontam para ela ` +
            "por FK. Rode antes a ação padrão: POST neste mesmo endpoint com " +
            '{ "confirmar": true } (sem "acao"). Nada foi escrito.',
        },
        { status: 409 },
      );
    }

    // A régua de 2 níveis é a MESMA de `hierarquia.ts`, a que
    // `hierarquia.test.ts` trava — não uma cópia. Roda sobre a árvore
    // SIMULADA, então um plano que produziria nível 3 é recusado antes de
    // qualquer INSERT. Hoje ela não tem como reprovar (as 5 penduram numa raiz
    // e nenhuma tem filhos); é guarda para o dia em que a lista canônica
    // crescer e alguém pendurar empresa em empresa sem perceber.
    const problemas = validarArvore(plano.arvoreSimulada);
    if (problemas.length > 0) {
      return NextResponse.json(
        {
          error: "arvore_fora_da_regua",
          mensagem: "Semear estas filhas produziria uma árvore fora da régua de 2 níveis. " +
            "Nada foi escrito.",
          problemas,
          plano: plano.criar,
        },
        { status: 409 },
      );
    }

    const quando = new Date().toISOString();
    const r = await semearFilhas(prisma, plano);

    // Uma linha de auditoria POR EMPRESA CRIADA, no mesmo padrão do
    // reparenting. `acao: "seed-filha"` (singular) porque a linha fala de UMA
    // empresa — é `empresaId` que diz qual, e é por ele que o índice
    // `[empresaId, timestamp]` responde "quando esta empresa nasceu?".
    //
    // Chamada que não criou nada não deixa linha: diferente da ação padrão, que
    // loga também o "ja_existia" para responder "quem TENTOU criar a raiz", o
    // interesse aqui é o nascimento de cada filha. Log de no-op em operação
    // feita para ser repetida só encheria a tabela.
    //
    // DEFENSIVO, igual à ação padrão: falha ao gravar o log não derruba a
    // resposta. As linhas já entraram e a operação é idempotente; devolver 500
    // faria o chamador repetir uma escrita que deu certo.
    let falhasDeLog = 0;
    for (const empresaId of r.criadas) {
      try {
        await prisma.empresaBootstrapLog.create({
          data: {
            usuarioId: ctx.userId,
            acao: "seed-filha",
            resultado: "criado",
            empresaId,
            ipAddress:
              request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
              request.headers.get("x-real-ip"),
            userAgent: request.headers.get("user-agent"),
            metadata: {
              parentId: ONIX_CO.id,
              totalAntes: r.totalAntes,
              totalDepois: r.totalDepois,
              criadasNestaChamada: r.criadas,
              pessoaId: ctx.pessoa?.id ?? null,
              executadoEm: quando,
            },
          },
        });
      } catch (erroLog) {
        falhasDeLog++;
        console.error(
          `[empresas/hierarquia] falha ao gravar EmpresaBootstrapLog de "${empresaId}":`,
          erroLog,
        );
      }
    }

    return NextResponse.json({
      acao: "seed-filhas",
      criadas: r.criadas,
      ja_existiam: plano.jaExistiam,
      divergencias: plano.divergencias,
      inseridas: r.inseridas,
      totalAntes: r.totalAntes,
      totalDepois: r.totalDepois,
      arvore: r.arvoreFinal,
      raiz: conferirRaiz(r.arvoreFinal),
      comPai: r.arvoreFinal.filter((e) => e.parentId !== null).length,
      falhasDeLog,
      executadoEm: quando,
      observacao:
        plano.divergencias.length > 0
          ? `${plano.divergencias.length} filha(s) já existem com outro pai e NÃO foram ` +
            'corrigidas aqui. Para consertar, use { "acao": "reparent", "modo": "dry-run" } ' +
            "e confira o plano antes de aplicar."
          : "Nenhuma empresa foi renomeada, movida ou apagada. Repetir esta chamada não " +
            "muda mais nada.",
    });
  } catch (e) {
    console.error("[empresas/hierarquia] seed-filhas falhou:", e);
    return NextResponse.json({ error: "erro ao semear as filhas" }, { status: 500 });
  }
}

/**
 * `acao: "reparent"` — pendura as 5 empresas na raiz.
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
