"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, AlertTriangle, ExternalLink, RefreshCw } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AcaoUnificada, OrigemAcao } from "@/lib/painel-do-dia/types";

const rotuloOrigem: Record<OrigemAcao, string> = {
  cockpit: "Cockpit",
  "ms-todo": "MS To Do",
  "priority-matrix": "Priority Matrix",
};

const rotuloOp: Record<NonNullable<AcaoUnificada["syncOp"]>, string> = {
  create: "criar",
  update: "atualizar",
  delete: "excluir",
};

/**
 * Drawer detalhado das acoes pendentes de sincronia com as fontes externas.
 * Substitui o badge "X aguardando sync" por algo clicavel com contexto.
 *
 * Sugestao 5 do roadmap do Painel do Dia.
 */
export function PendentesSyncDrawer({
  pendentes,
  open,
  onOpenChange,
  onForcarSync,
}: {
  pendentes: AcaoUnificada[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onForcarSync: () => void;
}) {
  const router = useRouter();
  const [isPending, start] = useTransition();

  // Agrupa por origem
  const porOrigem = pendentes.reduce<Record<OrigemAcao, AcaoUnificada[]>>(
    (acc, a) => {
      (acc[a.origem] ||= []).push(a);
      return acc;
    },
    {} as Record<OrigemAcao, AcaoUnificada[]>
  );

  const comErro = pendentes.filter((a) => a.syncError);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            {pendentes.length} ação{pendentes.length === 1 ? "" : "ões"} aguardando sync
          </DialogTitle>
          <DialogDescription>
            Mudanças locais que ainda não foram aplicadas na fonte externa (Priority Matrix, MS To Do).
          </DialogDescription>
        </DialogHeader>

        {comErro.length > 0 && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
            <p className="flex items-center gap-1.5 font-medium text-destructive">
              <AlertTriangle className="h-4 w-4" />
              {comErro.length} com erro
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Pode ser sessão Microsoft expirada ou rate limit do Priority Matrix.
            </p>
          </div>
        )}

        <div className="flex max-h-80 flex-col gap-3 overflow-auto">
          {pendentes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Tudo sincronizado. 🎉
            </p>
          ) : (
            (Object.keys(porOrigem) as OrigemAcao[]).map((origem) => (
              <section key={origem}>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {rotuloOrigem[origem]} ({porOrigem[origem].length})
                </p>
                <ul className="flex flex-col gap-1.5">
                  {porOrigem[origem].map((a) => (
                    <li
                      key={a.id}
                      className={cn(
                        "rounded-md border p-2 text-sm",
                        a.syncError
                          ? "border-destructive/30 bg-destructive/5"
                          : "border-border bg-muted/30"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="flex-1 min-w-0 truncate">{a.titulo}</p>
                        <Badge
                          variant="outline"
                          className="h-4 px-1.5 text-[10px]"
                        >
                          {a.syncOp ? rotuloOp[a.syncOp] : "sync"}
                        </Badge>
                      </div>
                      {a.syncError && (
                        <p className="mt-1 flex items-start gap-1 text-xs text-destructive">
                          <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
                          <span className="break-words">{a.syncError}</span>
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => start(() => router.refresh())}
            disabled={isPending}
          >
            <RefreshCw
              className={cn("h-4 w-4", isPending && "animate-spin")}
            />
            Recarregar
          </Button>
          <Button onClick={onForcarSync}>
            <ExternalLink className="h-4 w-4" />
            Forçar sincronização
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
