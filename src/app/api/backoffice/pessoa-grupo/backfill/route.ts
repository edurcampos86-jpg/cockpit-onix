/**
 * POST /api/backoffice/pessoa-grupo/backfill
 *
 * Popula `PessoaGrupo` a partir de `ClienteBackoffice.cpfCnpj` e liga
 * `pessoaGrupoId`. Corpo:
 *
 *   { "confirmar": true, "modo": "dry-run" }  → planeja, NÃO escreve
 *   { "confirmar": true, "modo": "aplicar" }  → executa em lotes de 200
 *
 * ── POR QUE ROTA PRÓPRIA, E NÃO UMA AÇÃO EM api/empresas/hierarquia ──────
 * Identidade de CLIENTE e hierarquia de EMPRESA são preocupações distintas:
 * tabelas distintas, régua distinta (`empresas/hierarquia.ts` versus
 * `empresas/pessoa-grupo.ts`), e risco distinto — aquele mexe em 6 linhas de
 * catálogo, este em milhares de linhas de cliente. Pendurar um backfill de
 * faixa vermelha numa rota de bootstrap faria as duas compartilharem
 * histórico de auditoria e superfície de erro sem nenhum ganho.
 *
 * ── A LÓGICA NÃO MORA AQUI ───────────────────────────────────────────────
 * `lib/backoffice/backfill-pessoa-grupo.ts` é o planejamento (PURO) e
 * `…-exec.ts` é a execução. Esta rota autentica, escolhe o modo, grava o
 * progresso e serializa. O ensaio de shadow-DB
 * (`scripts/ensaio-backfill-pessoa-grupo.ts`) consome os MESMOS módulos — é o
 * que faz o ensaio provar algo sobre o que a rota vai rodar.
 *
 * ── O DRY-RUN NÃO PODE ESCREVER ──────────────────────────────────────────
 * Ele chama `diagnosticar()`, que só faz `findMany`. `aplicarBackfill()` — a
 * única função com `create`/`update` — simplesmente não é chamada. Não é um
 * `if` no fim do caminho de escrita; são caminhos separados.
 *
 * ── O QUE A ESCRITA TOCA ─────────────────────────────────────────────────
 * `PessoaGrupo` (create via upsert) e `ClienteBackoffice.pessoaGrupoId`
 * (updateMany restrito a quem está com null). NENHUM outro campo de cliente.
 * NENHUM delete, em nenhum caminho.
 *
 * ── NENHUM DADO PESSOAL NA RESPOSTA ──────────────────────────────────────
 * Só contagens. Nem cpfCnpj, nem id de cliente, nem nome, nem e-mail —
 * inclusive na amostra de agrupamentos, que traz só tipo e número de contas.
 * A conversão acontece em `resumirPlano()`, num lugar só, para "a rota vaza
 * documento?" ser respondível lendo um tipo. Mesma regra de
 * `api/backoffice/recon-identidade`.
 *
 * ── GATE DE AUTORIZAÇÃO ──────────────────────────────────────────────────
 * `isAdmin(ctx)` de `@/lib/auth-helpers`, o mesmo de
 * `api/backoffice/recon-identidade` e `api/empresas/hierarquia`. Admin
 * estrito — `teamRole: "lideranca"` não passa.
 */
import { NextResponse } from "next/server";
import { unstable_noStore as noStore } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getAuthContext, isAdmin } from "@/lib/auth-helpers";
import { TAMANHO_DO_LOTE, somarLotes } from "@/lib/backoffice/backfill-pessoa-grupo";
import { aplicarBackfill, diagnosticar } from "@/lib/backoffice/backfill-pessoa-grupo-exec";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

/**
 * Alvo gravado em `EmpresaBootstrapLog.empresaId`.
 *
 * O campo se chama `empresaId` por ter nascido no bootstrap de `Empresa`, mas
 * NÃO tem FK (o schema declara isso: "o log tem de sobreviver ao alvo"). Aqui
 * ele carrega o nome da OPERAÇÃO, não uma empresa — é o que faz o índice
 * `[empresaId, timestamp]` responder "como foi o backfill de identidade?" sem
 * varrer a tabela. Valor fixo para os lotes de uma mesma execução ficarem
 * juntos.
 */
const ALVO_DO_LOG = "pessoa-grupo";

export async function POST(request: Request) {
  noStore();

  const ctx = await getAuthContext().catch(() => null);
  if (!ctx || !isAdmin(ctx)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Confirmação explícita no corpo, como nas demais rotas de escrita: sem
  // isso, um POST acidental (form, retry de proxy, curl pela metade) tocaria
  // milhares de linhas de cliente sem ninguém ter decidido.
  let confirmar: unknown;
  let modo: unknown;
  try {
    const body: unknown = await request.json();
    const obj = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
    confirmar = obj.confirmar;
    modo = obj.modo;
  } catch {
    confirmar = undefined;
  }

  if (confirmar !== true) {
    return NextResponse.json(
      {
        error: "confirmacao_ausente",
        mensagem:
          'Envie { "confirmar": true, "modo": "dry-run" } para ver o plano sem escrever, ' +
          'ou { "confirmar": true, "modo": "aplicar" } para executar.',
      },
      { status: 400 },
    );
  }

  // Modo é OBRIGATÓRIO e não tem padrão. Um default silencioso seria a pior
  // escolha possível aqui: se o padrão fosse "aplicar", um corpo incompleto
  // escreveria em massa; se fosse "dry-run", quem quis aplicar acharia que
  // aplicou. Exigir a palavra elimina as duas.
  if (modo !== "dry-run" && modo !== "aplicar") {
    return NextResponse.json(
      {
        error: "modo_invalido",
        mensagem:
          'Informe "modo": "dry-run" (planeja e não escreve) ou "aplicar" (executa em ' +
          `lotes de ${TAMANHO_DO_LOTE}, cada lote em sua própria transação).`,
      },
      { status: 400 },
    );
  }

  try {
    const quando = new Date().toISOString();

    if (modo === "dry-run") {
      const { resumo } = await diagnosticar(prisma);
      return NextResponse.json({
        modo,
        escreveu: false,
        tamanhoDoLote: TAMANHO_DO_LOTE,
        previsto: resumo,
        executadoEm: quando,
        observacao:
          "Nada foi escrito. `semLink` são as contas sem documento reconhecível — elas " +
          'ficam com pessoaGrupoId null de propósito, não é erro. Para executar, repita ' +
          'com { "modo": "aplicar" }.',
      });
    }

    const antes = await diagnosticar(prisma);

    console.log(
      `[pessoa-grupo/backfill] APLICAR por userId=${ctx.userId} em ${quando} — ` +
        `${antes.resumo.pessoasACriar} pessoa(s) a criar, ` +
        `${antes.resumo.linksAGravar} link(s) a gravar`,
    );

    let falhasDeLog = 0;
    const { lotes, depois } = await aplicarBackfill(prisma, antes.escrita, async (r) => {
      // Uma linha por LOTE, não por registro: com ~2 mil clientes, log por
      // registro encheria a tabela de auditoria com o dobro de linhas do que
      // ele audita, e a pergunta que o log responde ("até onde foi antes de
      // cair?") é sobre lote, não sobre cliente.
      //
      // DEFENSIVO: falha ao gravar não derruba o backfill. O lote já foi
      // confirmado; abortar aqui deixaria o trabalho feito e a resposta
      // dizendo que não foi.
      try {
        await prisma.empresaBootstrapLog.create({
          data: {
            usuarioId: ctx.userId,
            acao: "backfill-pessoa-grupo",
            resultado: r.linksGravados > 0 || r.pessoasCriadas > 0 ? "aplicado" : "sem_mudanca",
            empresaId: ALVO_DO_LOG,
            ipAddress:
              request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
              request.headers.get("x-real-ip"),
            userAgent: request.headers.get("user-agent"),
            // Só contadores — nenhum documento, nenhum id de cliente. O log é
            // consultável pela API de hierarquia, então vale a mesma regra de
            // PII da resposta.
            metadata: {
              lote: r.lote,
              totalLotes: r.totalLotes,
              tamanhoDoLote: TAMANHO_DO_LOTE,
              pessoasCriadas: r.pessoasCriadas,
              linksGravados: r.linksGravados,
              jaLigadas: r.jaLigadas,
              divergentes: r.divergentes,
              pessoaId: ctx.pessoa?.id ?? null,
              execucaoEm: quando,
            },
          },
        });
      } catch (erroLog) {
        falhasDeLog++;
        console.error(
          `[pessoa-grupo/backfill] falha ao gravar o rastro do lote ${r.lote}:`,
          erroLog,
        );
      }
    });

    const medido = somarLotes(lotes);

    return NextResponse.json({
      modo,
      escreveu: true,
      tamanhoDoLote: TAMANHO_DO_LOTE,
      lotes: lotes.length,
      // Os mesmos contadores do dry-run, agora MEDIDOS: `previsto` é o que o
      // plano dizia antes de escrever, `medido` é o que o banco confirmou.
      // Divergência entre os dois é sinal de escrita concorrente, e é para
      // isso que os dois saem lado a lado em vez de só o segundo.
      previsto: antes.resumo,
      medido,
      // Relido do banco DEPOIS de tudo. `linksAGravar: 0` e `pessoasACriar: 0`
      // aqui é a prova de que o backfill fechou.
      restante: depois.resumo,
      progressoPorLote: lotes,
      falhasDeLog,
      executadoEm: quando,
      observacao:
        depois.resumo.linksAGravar === 0 && depois.resumo.pessoasACriar === 0
          ? "Backfill completo. Reexecutar não muda mais nada. As contas em `semLink` " +
            "seguem sem documento reconhecível, o que é o estado esperado."
          : `Ainda restam ${depois.resumo.pessoasACriar} pessoa(s) e ` +
            `${depois.resumo.linksAGravar} link(s) — reexecute para continuar de onde parou.`,
    });
  } catch (e) {
    // A mensagem do driver pode conter a connection string, logo credencial —
    // e, num erro de constraint, pode conter o próprio documento. Vai só para
    // o log do servidor.
    console.error("[pessoa-grupo/backfill] falhou:", e);
    return NextResponse.json({ error: "erro ao executar o backfill" }, { status: 500 });
  }
}
