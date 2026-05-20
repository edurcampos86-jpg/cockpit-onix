"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, History } from "lucide-react";

type BackfillResult = {
  ok: boolean;
  userId?: string;
  totalEmailsConsultados?: number;
  processados?: number;
  duplicatasHash?: number;
  duplicatasEmail?: number;
  ignoradosSemPdf?: number;
  ignoradosRemetente?: number;
  erros?: number;
  error?: string;
};

export function BackfillButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [limit, setLimit] = useState<number>(200);
  const [result, setResult] = useState<BackfillResult | null>(null);

  function rodar() {
    setResult(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/admin/juridico/email-backfill", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ limit }),
        });
        const json = (await res.json()) as BackfillResult;
        setResult(json);
        router.refresh();
      } catch (e) {
        setResult({ ok: false, error: (e as Error).message });
      }
    });
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold">Backfill manual (passivo)</h3>
        <p className="text-xs text-muted-foreground">
          Busca emails HISTÓRICOS (sem filtro de data) dos remetentes conhecidos.
          Use UMA vez pra trazer o acervo. Idempotente — pode rodar várias vezes.
        </p>
      </div>
      <div className="flex items-end gap-3">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">
            Limite de emails por execução (1-500)
          </label>
          <input
            type="number"
            min={1}
            max={500}
            value={limit}
            onChange={(e) => setLimit(Math.min(500, Math.max(1, parseInt(e.target.value) || 1)))}
            disabled={isPending}
            className="block w-32 rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
        <button
          onClick={rodar}
          disabled={isPending}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <History className="h-4 w-4" />}
          Rodar backfill agora
        </button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Cada execução leva ~2-10s por email (download anexo + upload B2 + extração Claude).
        Limite alto = mais tempo. Se precisar processar 1000+ emails, roda 5x com 200 cada.
      </p>

      {result && (
        <div
          className={
            result.ok
              ? "rounded border border-green-300 bg-green-50 dark:bg-green-950/20 p-3 text-sm space-y-1"
              : "rounded border border-destructive bg-destructive/10 p-3 text-sm"
          }
        >
          {result.ok ? (
            <>
              <strong className="text-green-900 dark:text-green-200">
                Backfill completo:
              </strong>
              <ul className="text-xs space-y-0.5 text-green-800 dark:text-green-300">
                <li>{result.totalEmailsConsultados} emails consultados</li>
                <li>{result.processados} novos contratos</li>
                <li>{result.duplicatasHash} PDFs já no cofre (hash)</li>
                <li>{result.duplicatasEmail} emails já processados antes</li>
                <li>{result.ignoradosSemPdf} sem anexo PDF</li>
                <li>{result.ignoradosRemetente} remetente fora da lista</li>
                <li>{result.erros} erros</li>
              </ul>
            </>
          ) : (
            <span className="text-destructive">{result.error}</span>
          )}
        </div>
      )}
    </div>
  );
}
