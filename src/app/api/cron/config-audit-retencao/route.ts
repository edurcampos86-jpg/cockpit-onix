import { NextRequest, NextResponse } from "next/server";
import { guardCron } from "@/lib/painel-do-dia/cron-guard";
import { aplicarRetencaoConfigAudit } from "@/lib/flags/retencao";

/**
 * GET /api/cron/config-audit-retencao
 *
 * Poda mensal do histórico de mudanças de flags (`ConfigAudit`). Primeira
 * rotina de retenção do Cockpit — `AlertaClienteLog` e `BtgSyncLog` têm o mesmo
 * formato e também crescem sem teto, mas nenhuma tem poda hoje; se este molde
 * se provar, servem de próximos.
 *
 * APAGA por padrão, ao contrário de `implementacoes-anexos-orfaos`, que roda em
 * modo relatório. A diferença é o tipo de decisão: lá o que se apaga vem de uma
 * CLASSIFICAÇÃO (é órfão mesmo?), que pode errar e destruir arquivo de cliente.
 * Aqui a regra é uma comparação de data, exata e sem julgamento — deixar em modo
 * relatório significaria retenção que nunca acontece, que é o mesmo que não ter.
 *
 * O risco real desta rotina não é errar a regra, é a regra estar configurada
 * errado — e contra isso vale o PISO DE 365 DIAS em `lib/flags/retencao.ts`,
 * que ignora config menor que um ano.
 *
 * `?apagar=0` força o modo relatório, para conferir o que sairia antes de uma
 * mudança de prazo.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const guardErr = guardCron(req);
  if (guardErr) return guardErr;

  const apagar = req.nextUrl.searchParams.get("apagar") !== "0";

  try {
    const r = await aplicarRetencaoConfigAudit({ apagar });

    if (r.pisoAplicado) {
      console.warn(
        "[config-audit-retencao] config abaixo do piso foi ignorada — ver lib/flags/retencao.ts",
      );
    }
    if (r.candidatos > 0) {
      console.info(
        `[config-audit-retencao] retenção ${r.dias}d (corte ${r.corte}): ` +
          `${r.candidatos} candidatas, ${r.apagados} apagadas` +
          `${apagar ? "" : " — modo relatório, nada apagado"}`,
      );
    }

    return NextResponse.json({ ok: true, modo: apagar ? "apagar" : "relatorio", ...r });
  } catch (e) {
    console.error("[config-audit-retencao] falha", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "erro desconhecido" },
      { status: 500 },
    );
  }
}
