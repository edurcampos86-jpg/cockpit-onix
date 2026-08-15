import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cronAutorizado } from "@/lib/painel-do-dia/cron-guard";
import { resolverEstadoDasFlags } from "@/lib/flags/estado";
import { chavesLigadasDe, chavesNaoReconhecidasDe } from "@/lib/flags/ligadas";
import { versaoDeploy } from "@/lib/versao-deploy";
import { lerEstadoMigrations, type EstadoMigrations } from "@/lib/migrations-aplicadas";
import {
  resumirAuditoria,
  resumirPorIntegracao,
  type EstadoIntegracoes,
  type EstadoDeUmaIntegracao,
} from "@/lib/integracoes-auditadas";

// Health check público. Usado por:
//   - .github/workflows/post-deploy-smoke.yml (após deploy + cron 15min)
//   - eventual uptime monitor externo (StatusCake / Uptime Kuma)
//
// SEM autenticação: é endpoint diagnóstico e não vaza dados.
// Retorna 200 com { status:'ok', db:'up' } quando tudo OK; retorna 503
// com { status:'degraded', db:'down', dbError } quando o ping ao Postgres
// falha — assim o smoke test detecta DB down separado de app down.
//
// ── Configuração do ambiente (`flags` + `versao`) ───────────────────────
// Acrescentados APENAS para quem apresenta `Authorization: Bearer $CRON_SECRET`.
//
// `versao` responde QUAL commit está no ar. Sem isso o smoke provava só que
// "alguma coisa" respondia: um deploy que falhou em subir deixa a versão
// anterior servindo, e todos os probes passam verdes contra código velho —
// falha silenciosa exatamente no momento em que se quer conferir um deploy.
// `versao.ambiente` (RAILWAY_ENVIRONMENT_NAME) responde de quebra "em qual
// ambiente eu bati?", sem depender de decorar URLs.
// A resposta anônima segue byte-idêntica à de antes, e isso não é zelo
// decorativo: o body deste endpoint é colado dentro da issue de incidente que
// o smoke abre quando falha (post-deploy-smoke.yml). Publicar ali quais
// funcionalidades existem e quais gates estão ligados — `RBAC_ENFORCEMENT`
// desligado, por exemplo — seria entregar de graça o mapa do que atacar.
//
// CRON_SECRET e não sessão de admin porque quem consome é máquina: o workflow
// já carrega esse segredo para as rotas de cron, e o payload é uma lista de
// nomes de allowlist, sem valor sensível.

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const timestamp = new Date().toISOString();
  const start = Date.now();

  try {
    await prisma.$queryRaw`SELECT 1`;

    // Só depois do ping: com o banco de pé, ler as flags é uma query a mais.
    // O try/catch é para o diagnóstico NUNCA derrubar o health — uma falha ao
    // listar flags viraria 503 e abriria incidente com a app perfeitamente no ar.
    const autorizado = cronAutorizado(request);

    let flags: string[] | undefined;
    /* Chaves cujo valor gravado o dialeto não reconhece. Vai junto de `flags`
     * e sob o MESMO gate: as duas listas nomeiam chaves, e a resposta anônima
     * segue byte-idêntica.
     *
     * É lista, não contagem: o consumidor é o smoke pós-deploy, que cola a
     * resposta na issue de incidente. "2 flags com valor inválido" manda
     * alguém procurar; os nomes mandam alguém consertar. */
    let flagsValorInvalido: string[] | undefined;
    /* QUAL SCHEMA está no ar, ao lado de qual CÓDIGO está no ar (`versao`).
     *
     * Passou a fazer falta quando `prisma migrate deploy` saiu do `startCommand`
     * e virou `preDeployCommand` (#317). Antes, app respondendo implicava schema
     * aplicado — migrar e subir eram o mesmo comando. Agora não são, e existe um
     * estado novo: app no ar com schema velho, que o `SELECT 1` acima não vê.
     *
     * `migrations.pendentes` é o campo que importa: > 0 significa que o código
     * servindo requisições espera colunas que o banco não tem. */
    let migrations: EstadoMigrations | undefined;
    /* O último veredito de `/api/cron/integration-audit`, que roda de 30 em 30
     * minutos e já sabe se Google e BTG estão sãos.
     *
     * Ele funcionava e ninguém via: a resposta só existia no log do run e numa
     * linha de `BtgSyncLog`. Em 15/08, responder "o webhook do BTG parou por
     * credencial?" custou abrir o log de um run à mão — a resposta estava
     * pronta havia 30 minutos.
     *
     * `integracoes.idadeMinutos` é o campo que importa tanto quanto `ok`: com
     * o cron de 30 em 30, idade muito maior que isso quer dizer que o próprio
     * auditor parou, e aí o `ok` é verde do tipo que engana.
     *
     * `integracoes.porIntegracao` quebra o veredito por integração (6 hoje:
     * google, microsoft, btg, datacrazy, zapi, b2), cada uma com a própria
     * idade. Uma rodada verde não diz que a linha do Datacrazy está verde — e
     * é o Datacrazy que mantém `ultimoContatoAt` vivo. */
    let integracoes:
      | (EstadoIntegracoes & { porIntegracao: EstadoDeUmaIntegracao[] })
      | undefined;
    if (autorizado) {
      try {
        const estado = await resolverEstadoDasFlags();
        flags = chavesLigadasDe(estado);
        flagsValorInvalido = chavesNaoReconhecidasDe(estado);
      } catch (error) {
        console.warn(
          `[health] falha ao ler flags: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      // try/catch próprio, e não o mesmo das flags: ler `_prisma_migrations` e
      // ler `Config` falham por motivos diferentes, e uma falha não deve apagar
      // o diagnóstico da outra.
      try {
        migrations = await lerEstadoMigrations(prisma);
      } catch (error) {
        console.warn(
          `[health] falha ao ler migrations: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      // try/catch próprio pela mesma razão dos dois acima: são leituras
      // independentes, e uma falhar não pode apagar o diagnóstico da outra.
      try {
        const ultimaAuditoria = await prisma.btgSyncLog.findFirst({
          where: { tipo: "integration-audit" },
          orderBy: { iniciado: "desc" },
          select: {
            iniciado: true,
            finalizado: true,
            sucesso: true,
            contasProcessadas: true,
            contasComErro: true,
            resumo: true,
          },
        });
        // Duas leituras, dois níveis: `BtgSyncLog` diz como foi a RODADA;
        // `IntegracaoAuditoria` diz o estado de cada integração. Uma rodada
        // verde com uma linha parada há dias é exatamente o caso que a média
        // esconderia.
        const linhas = await prisma.integracaoAuditoria.findMany({
          select: { integracao: true, status: true, updatedAt: true },
        });
        const agora = new Date();
        integracoes = {
          ...resumirAuditoria(ultimaAuditoria, agora),
          porIntegracao: resumirPorIntegracao(linhas, agora),
        };
      } catch (error) {
        console.warn(
          `[health] falha ao ler auditoria de integrações: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return NextResponse.json(
      {
        status: "ok",
        db: "up",
        dbLatencyMs: Date.now() - start,
        timestamp,
        // Ausente para chamador anônimo; `[]` autenticado significa "nenhuma
        // flag ligada", que é diferente de "não perguntei". Vale igual para
        // `flagsValorInvalido`: `[]` é o estado saudável e o smoke conta com
        // essa diferença para não confundir "está tudo certo" com "versão
        // antiga no ar".
        ...(flags ? { flags } : {}),
        ...(flagsValorInvalido ? { flagsValorInvalido } : {}),
        ...(migrations ? { migrations } : {}),
        ...(integracoes ? { integracoes } : {}),
        // `versao` não depende do banco (só de env), então sai mesmo que a
        // leitura das flags tenha falhado — é justamente nesse cenário que
        // saber qual commit está no ar mais ajuda.
        ...(autorizado ? { versao: versaoDeploy() } : {}),
      },
      { status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Sem `flags` no caminho degradado de propósito: o banco é justamente o que
    // não respondeu, então o estado das flags seria adivinhação.
    return NextResponse.json(
      {
        status: "degraded",
        db: "down",
        dbError: message,
        timestamp,
      },
      { status: 503 },
    );
  }
}
