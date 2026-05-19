"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Upload } from "lucide-react";

type JobStatus = {
  id: string;
  status: "running" | "completed" | "failed";
  totalArquivos: number;
  processados: number;
  sucessos: number;
  erros: number;
  pulados: number;
  progresso: number;
};

export function ImportClient() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [file, setFile] = useState<File | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<JobStatus | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Polling enquanto job tá rodando
  useEffect(() => {
    if (!jobId) return;
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/admin/import-juridico-bulk/${jobId}/status`);
        if (!res.ok) return;
        const json = (await res.json()) as JobStatus;
        setStatus(json);
        if (json.status === "completed" || json.status === "failed") {
          if (pollRef.current) clearInterval(pollRef.current);
          router.refresh();
        }
      } catch {}
    }, 2000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [jobId, router]);

  function enviar() {
    if (!file) {
      setErro("Selecione um ZIP");
      return;
    }
    if (!file.name.toLowerCase().endsWith(".zip")) {
      setErro("Arquivo precisa ser .zip");
      return;
    }
    setErro(null);
    setStatus(null);
    const form = new FormData();
    form.append("zipFile", file);
    startTransition(async () => {
      try {
        const res = await fetch("/api/admin/import-juridico-bulk", {
          method: "POST",
          body: form,
        });
        const json = (await res.json()) as { ok?: boolean; jobId?: string; error?: string };
        if (!res.ok || !json.jobId) {
          setErro(json.error || `HTTP ${res.status}`);
          return;
        }
        setJobId(json.jobId);
      } catch (e) {
        setErro((e as Error).message);
      }
    });
  }

  return (
    <div className="rounded-xl border border-border bg-card p-6 space-y-4">
      {!jobId && (
        <>
          <div className="space-y-1">
            <label className="block text-sm font-medium">ZIP do 5.Jurídico</label>
            <input
              type="file"
              accept=".zip,application/zip"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              disabled={isPending}
              className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-medium file:text-primary-foreground hover:file:bg-primary/90"
            />
            {file && (
              <p className="text-xs text-muted-foreground">
                {file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB
              </p>
            )}
          </div>
          <button
            onClick={enviar}
            disabled={isPending || !file}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Iniciar importação
          </button>
        </>
      )}

      {jobId && status && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">
              Job <code className="text-xs">{jobId}</code>
            </span>
            <span
              className={
                status.status === "completed"
                  ? "text-green-600 text-sm"
                  : status.status === "failed"
                    ? "text-destructive text-sm"
                    : "text-amber-600 text-sm"
              }
            >
              {status.status}
            </span>
          </div>
          <div className="w-full h-2 bg-muted rounded overflow-hidden">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${status.progresso}%` }}
            />
          </div>
          <div className="text-xs text-muted-foreground">
            {status.processados} / {status.totalArquivos} processados ·{" "}
            <span className="text-green-600">{status.sucessos} OK</span> ·{" "}
            <span className="text-amber-600">{status.pulados} duplicatas</span> ·{" "}
            <span className="text-destructive">{status.erros} erros</span>
          </div>
          {(status.status === "completed" || status.status === "failed") && (
            <button
              onClick={() => {
                setJobId(null);
                setStatus(null);
                setFile(null);
              }}
              className="text-xs text-primary hover:underline"
            >
              Subir outro ZIP
            </button>
          )}
        </div>
      )}

      {erro && (
        <div className="rounded border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
          {erro}
        </div>
      )}
    </div>
  );
}
