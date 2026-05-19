"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, XCircle, RotateCw, Loader2 } from "lucide-react";

export function ContratoActions({
  contratoId,
  statusAtual,
  podeAprovar,
}: {
  contratoId: string;
  statusAtual: string;
  podeAprovar: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [motivoRejeicao, setMotivoRejeicao] = useState("");
  const [mostrarRejeicao, setMostrarRejeicao] = useState(false);

  function chamar(
    endpoint: string,
    body: Record<string, unknown> | null,
    successMsg: string
  ) {
    setErro(null);
    setMensagem(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/juridico/contratos/${contratoId}/${endpoint}`, {
          method: "POST",
          headers: body ? { "Content-Type": "application/json" } : undefined,
          body: body ? JSON.stringify(body) : undefined,
        });
        const json = (await res.json()) as { ok?: boolean; error?: string };
        if (!res.ok) {
          setErro(json.error || `HTTP ${res.status}`);
          return;
        }
        setMensagem(successMsg);
        router.refresh();
      } catch (e) {
        setErro((e as Error).message);
      }
    });
  }

  const podeAprovarOuRejeitar = statusAtual === "pendente_revisao" && podeAprovar;

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <h3 className="text-sm font-semibold">Ações</h3>

      {podeAprovarOuRejeitar && (
        <>
          <button
            onClick={() => chamar("aprovar", null, "Contrato aprovado")}
            disabled={isPending}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Aprovar
          </button>

          {!mostrarRejeicao ? (
            <button
              onClick={() => setMostrarRejeicao(true)}
              disabled={isPending}
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-destructive text-destructive px-3 py-2 text-sm font-medium hover:bg-destructive/10 disabled:opacity-50"
            >
              <XCircle className="h-4 w-4" />
              Rejeitar
            </button>
          ) : (
            <div className="space-y-2 rounded-lg border border-destructive/40 p-3">
              <textarea
                value={motivoRejeicao}
                onChange={(e) => setMotivoRejeicao(e.target.value)}
                rows={3}
                placeholder="Motivo da rejeição (mínimo 5 chars)..."
                className="block w-full rounded border border-border bg-background px-2 py-1 text-xs"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => chamar("rejeitar", { observacoesRevisao: motivoRejeicao }, "Rejeitado")}
                  disabled={isPending || motivoRejeicao.trim().length < 5}
                  className="flex-1 inline-flex items-center justify-center gap-1 rounded bg-destructive text-destructive-foreground px-2 py-1 text-xs disabled:opacity-50"
                >
                  Confirmar rejeição
                </button>
                <button
                  onClick={() => setMostrarRejeicao(false)}
                  disabled={isPending}
                  className="rounded border border-border px-2 py-1 text-xs hover:bg-muted"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </>
      )}

      <button
        onClick={() => chamar("reextrair", null, "Re-extração disparada")}
        disabled={isPending}
        className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
      >
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCw className="h-4 w-4" />}
        Reextrair com Claude
      </button>

      {erro && (
        <div className="rounded border border-destructive bg-destructive/10 p-2 text-xs text-destructive">
          {erro}
        </div>
      )}
      {mensagem && (
        <div className="rounded border border-green-300 bg-green-50 dark:bg-green-950/20 p-2 text-xs text-green-700 dark:text-green-300">
          {mensagem}
        </div>
      )}
    </div>
  );
}
