"use client";

import Link from "next/link";
import { useState } from "react";
import { ExternalLink, Loader2, Sparkles, AlertTriangle } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Status =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; draftId: string; draftUrl: string; preview: string }
  | { kind: "needReconnect"; reason: "scope_missing" | "google_not_connected" | "invalid_grant" }
  | { kind: "error"; message: string };

export function QuickReplyModal({
  aiId,
  open,
  onOpenChange,
  assunto,
  remetente,
}: {
  aiId: string | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  assunto?: string;
  remetente?: string;
}) {
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function gerar() {
    if (!aiId) return;
    setStatus({ kind: "loading" });
    try {
      const res = await fetch(
        `/api/painel-do-dia/email/${aiId}/quick-reply`,
        { method: "POST" },
      );
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setStatus({
          kind: "ready",
          draftId: data.draftId,
          draftUrl: data.draftUrl,
          preview: data.preview,
        });
        return;
      }
      if (
        res.status === 412 &&
        (data.error === "scope_missing" ||
          data.error === "google_not_connected" ||
          data.error === "invalid_grant")
      ) {
        setStatus({ kind: "needReconnect", reason: data.error });
        return;
      }
      setStatus({
        kind: "error",
        message: data.error ?? `Erro HTTP ${res.status}`,
      });
    } catch (err) {
      setStatus({
        kind: "error",
        message: err instanceof Error ? err.message : "Falha ao gerar rascunho",
      });
    }
  }

  function handleOpenChange(o: boolean) {
    if (!o) setStatus({ kind: "idle" });
    onOpenChange(o);
    if (o && status.kind === "idle") {
      void gerar();
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Responder com Claude
          </DialogTitle>
          {(remetente || assunto) && (
            <DialogDescription>
              {remetente && <span className="block truncate">De: {remetente}</span>}
              {assunto && (
                <span className="block truncate font-medium text-foreground">
                  {assunto}
                </span>
              )}
            </DialogDescription>
          )}
        </DialogHeader>

        {status.kind === "loading" && (
          <div className="flex items-center gap-2 rounded-md ring-1 ring-foreground/10 p-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Gerando rascunho... isso pode levar alguns segundos.
          </div>
        )}

        {status.kind === "needReconnect" && (
          <div className="rounded-md ring-1 ring-amber-300/60 bg-amber-50/50 dark:bg-amber-900/10 p-3 text-sm space-y-2">
            <p className="flex items-center gap-2 font-medium text-amber-900 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4" />
              Permissão extra necessária
            </p>
            <p className="text-amber-900/90 dark:text-amber-200/90">
              Para criar rascunhos no seu Gmail, sua conta Google precisa
              autorizar a permissão <code>gmail.compose</code>. Desconecte e
              reconecte sua conta nas Integrações pra liberar.
            </p>
            <Link
              href="/integracoes"
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              Ir para Integrações <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        )}

        {status.kind === "error" && (
          <div className="rounded-md ring-1 ring-destructive/40 bg-destructive/5 p-3 text-sm space-y-2">
            <p className="font-medium text-destructive">Erro ao gerar rascunho</p>
            <p className="text-destructive/90">{status.message}</p>
            <Button size="sm" variant="outline" onClick={() => void gerar()}>
              Tentar novamente
            </Button>
          </div>
        )}

        {status.kind === "ready" && (
          <div className="space-y-3">
            <div className="rounded-md ring-1 ring-foreground/10 p-3 bg-muted/30 text-sm whitespace-pre-wrap">
              {status.preview}
            </div>
            <p className="text-xs text-muted-foreground">
              Rascunho salvo no Gmail (nada foi enviado). Revise, ajuste se
              precisar e mande pelo Gmail.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Fechar
          </Button>
          {status.kind === "ready" && (
            <a
              href={status.draftUrl}
              target="_blank"
              rel="noreferrer"
              className={cn(buttonVariants({ variant: "default" }))}
            >
              Abrir no Gmail <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
