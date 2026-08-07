import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cronAutorizado } from "@/lib/painel-do-dia/cron-guard";
import { chavesLigadas } from "@/lib/flags/estado";

// Health check público. Usado por:
//   - .github/workflows/post-deploy-smoke.yml (após deploy + cron 15min)
//   - eventual uptime monitor externo (StatusCake / Uptime Kuma)
//
// SEM autenticação: é endpoint diagnóstico e não vaza dados.
// Retorna 200 com { status:'ok', db:'up' } quando tudo OK; retorna 503
// com { status:'degraded', db:'down', dbError } quando o ping ao Postgres
// falha — assim o smoke test detecta DB down separado de app down.
//
// ── Estado das flags (`flags`) ──────────────────────────────────────────
// Acrescentado APENAS para quem apresenta `Authorization: Bearer $CRON_SECRET`.
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
    let flags: string[] | undefined;
    if (cronAutorizado(request)) {
      try {
        flags = await chavesLigadas();
      } catch (error) {
        console.warn(
          `[health] falha ao ler flags: ${error instanceof Error ? error.message : String(error)}`,
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
        // flag ligada", que é diferente de "não perguntei".
        ...(flags ? { flags } : {}),
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
