"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, PlayCircle } from "lucide-react";

export function BackupActions({ disabled }: { disabled: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);

  function rodarBackup() {
    setErro(null);
    setMensagem("Rodando backup… pode demorar 1-2 minutos.");
    startTransition(async () => {
      try {
        const res = await fetch("/api/admin/backups/manual", { method: "POST" });
        const json = (await res.json()) as {
          ok?: boolean;
          erro?: string;
          filename?: string;
          sizeBytes?: number;
          durationSeconds?: number;
          error?: string;
        };
        if (!res.ok || !json.ok) {
          setErro(json.erro || json.error || `HTTP ${res.status}`);
          setMensagem(null);
          return;
        }
        setMensagem(
          `Backup OK: ${json.filename} (${((json.sizeBytes || 0) / 1024 / 1024).toFixed(1)} MB em ${json.durationSeconds}s)`
        );
        router.refresh();
      } catch (e) {
        setErro((e as Error).message);
        setMensagem(null);
      }
    });
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-start gap-3">
        <button
          onClick={rodarBackup}
          disabled={disabled || isPending}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
          Rodar backup agora
        </button>
        {disabled && (
          <p className="text-xs text-amber-700 dark:text-amber-300">
            Pré-requisitos não atendidos (B2 ou pg_dump). Veja status acima.
          </p>
        )}
      </div>
      {erro && (
        <div className="rounded border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
          {erro}
        </div>
      )}
      {mensagem && !erro && (
        <div className="rounded border border-green-300 bg-green-50 dark:bg-green-950/20 p-3 text-sm text-green-700 dark:text-green-300">
          {mensagem}
        </div>
      )}
    </div>
  );
}
