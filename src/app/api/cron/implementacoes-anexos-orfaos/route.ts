import { NextRequest, NextResponse } from "next/server";
import { guardCron } from "@/lib/painel-do-dia/cron-guard";
import { varrerAnexosOrfaos } from "@/lib/implementacoes/anexos-orfaos";

/**
 * GET /api/cron/implementacoes-anexos-orfaos
 *
 * Varredura mensal de anexos órfãos no Backblaze — objeto no bucket sem linha
 * no banco apontando para ele. O `onDelete: Cascade` limpa as linhas, não o
 * bucket; órfão é custo mensal que ninguém vê na UI.
 *
 * MODO RELATÓRIO POR PADRÃO. A rota só APAGA com `?apagar=1` explícito na URL.
 * Rotina que apaga arquivo sozinha, todo mês, sem ninguém olhar, é a forma mais
 * cara de descobrir um bug de classificação — então o cron agendado roda em
 * dry-run e a limpeza é uma chamada deliberada, feita depois de ler o relatório.
 *
 * Sem B2 configurado responde 200 com `configurado: false`.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const guardErr = guardCron(req);
  if (guardErr) return guardErr;

  const apagar = req.nextUrl.searchParams.get("apagar") === "1";

  try {
    const r = await varrerAnexosOrfaos({ apagar });
    if (r.orfaos > 0) {
      console.warn(
        `[anexos-orfaos] ${r.orfaos} órfãos (${Math.round(r.bytesOrfaos / 1024)} KB)` +
          `${apagar ? `, ${r.apagados} apagados` : " — modo relatório, nada apagado"}`,
      );
    }
    return NextResponse.json({ ok: true, modo: apagar ? "apagar" : "relatorio", ...r });
  } catch (e) {
    console.error("[anexos-orfaos] falha", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "erro desconhecido" },
      { status: 500 },
    );
  }
}
