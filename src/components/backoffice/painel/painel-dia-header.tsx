"use client";

import { RefreshCw, Zap, Check, Copy } from "lucide-react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PendentesSyncDrawer } from "./pendentes-sync-drawer";
import type { AcaoUnificada } from "@/lib/painel-do-dia/types";

const fmtData = new Intl.DateTimeFormat("pt-BR", {
  weekday: "long",
  day: "2-digit",
  month: "long",
  timeZone: "America/Bahia",
});

const COMANDO_SYNC = "sincroniza tudo agora";

export function PainelDiaHeader({
  data,
  pendingSyncCount,
  acoesPendentes,
}: {
  data: string;
  pendingSyncCount: number;
  acoesPendentes: AcaoUnificada[];
}) {
  const router = useRouter();
  const [isPending, start] = useTransition();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [syncEnfileirado, setSyncEnfileirado] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [erroSync, setErroSync] = useState<string | null>(null);

  async function abrirSync() {
    setDialogOpen(true);
    setSyncEnfileirado(false);
    setErroSync(null);

    try {
      const res = await fetch("/api/painel-do-dia/sync-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sources: "all" }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSyncEnfileirado(true);
    } catch (e) {
      setErroSync(e instanceof Error ? e.message : "falha ao enfileirar");
    }
  }

  async function copiarComando() {
    await navigator.clipboard.writeText(COMANDO_SYNC);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  return (
    <>
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground capitalize">
          {fmtData.format(new Date(`${data}T12:00:00-03:00`))}
        </span>
        {pendingSyncCount > 0 && (
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="transition-opacity hover:opacity-80"
            aria-label="Ver detalhes das sincronizações pendentes"
          >
            <Badge
              variant="outline"
              className={
                acoesPendentes.some((a) => a.syncError)
                  ? "border-destructive/40 text-destructive"
                  : undefined
              }
            >
              {pendingSyncCount} aguardando sync
              {acoesPendentes.some((a) => a.syncError) && " ⚠"}
            </Badge>
          </button>
        )}
        <Button variant="default" size="sm" onClick={abrirSync}>
          <Zap className="h-4 w-4" />
          Sincronizar
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => start(() => router.refresh())}
          disabled={isPending}
        >
          <RefreshCw className={isPending ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          Atualizar
        </Button>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sincronizar fontes cowork</DialogTitle>
            <DialogDescription>
              Microsoft (Outlook + To Do) e Priority Matrix sincronizam via
              Chrome MCP. O Claude Code na sua máquina precisa ler e aplicar.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {erroSync ? (
              <div className="rounded-md ring-1 ring-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                Falha ao enfileirar o pedido: {erroSync}
              </div>
            ) : syncEnfileirado ? (
              <div className="rounded-md ring-1 ring-foreground/10 bg-foreground/5 p-3 text-sm">
                <p className="font-medium flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-600" />
                  Pedido de sync enfileirado.
                </p>
                <p className="text-muted-foreground mt-1">
                  O Claude Code vai processar na próxima vez que abrir.
                </p>
              </div>
            ) : (
              <div className="rounded-md ring-1 ring-foreground/10 p-3 text-sm text-muted-foreground">
                Enfileirando pedido...
              </div>
            )}

            <div className="space-y-2">
              <p className="text-sm font-medium">
                Pra forçar agora, abra o Claude Code e diga:
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded-md ring-1 ring-foreground/10 bg-foreground/5 px-3 py-2 text-sm font-mono">
                  {COMANDO_SYNC}
                </code>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={copiarComando}
                  aria-label="Copiar comando"
                >
                  {copiado ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <PendentesSyncDrawer
        pendentes={acoesPendentes}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        onForcarSync={() => {
          setDrawerOpen(false);
          abrirSync();
        }}
      />
    </>
  );
}
