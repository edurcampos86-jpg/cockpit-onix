import { NextRequest, NextResponse } from "next/server";
import { guardCron } from "@/lib/painel-do-dia/cron-guard";
import { sincronizarStatusPrs } from "@/lib/implementacoes/pr-sync";

/**
 * GET /api/cron/implementacoes-pr-status
 *
 * Atualiza o estado dos PRs vinculados a sugestões da Central de
 * Implementações (aberta → merged/fechada), a cada 30min.
 *
 * Sem esta rota, `prStatus` congela no valor gravado à mão na hora do vínculo
 * — quase sempre "aberta" — e a métrica de lead time só enxerga os PRs que
 * alguém lembrou de voltar e atualizar.
 *
 * Só LÊ do GitHub. Consulta apenas os vínculos ainda "aberta" (estado
 * terminal não é reconsultado) e no máximo 50 por rodada.
 *
 * Sem GITHUB_TOKEN configurado responde 200 com `configurado: false` em vez de
 * erro: a sincronia é conveniência, não dependência, e o cron não deve ficar
 * vermelho por uma integração opcional que ninguém ligou.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const guardErr = guardCron(req);
  if (guardErr) return guardErr;

  try {
    const r = await sincronizarStatusPrs();
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    console.error("[implementacoes-pr-status] falha", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "erro desconhecido" },
      { status: 500 },
    );
  }
}
