"use client";

import * as React from "react";
import { Loader2, AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/**
 * Diálogo de confirmação construído sobre o Dialog base-ui existente (o
 * projeto não tem alert-dialog; o Dialog cobre focus-trap, Esc e overlay).
 *
 * No modo destrutivo o FOCO INICIAL vai para o "Cancelar" (via `initialFocus`
 * do base-ui) — Enter afobado não apaga nada.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  titulo,
  descricao,
  textoConfirmar,
  textoOcupado,
  textoCancelar = "Cancelar",
  destrutivo = false,
  onConfirmar,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  titulo: string;
  descricao: string;
  textoConfirmar: string;
  /** Rótulo do botão enquanto a confirmação está em voo (ex.: "Removendo..."). */
  textoOcupado?: string;
  textoCancelar?: string;
  destrutivo?: boolean;
  onConfirmar: () => Promise<void>;
}) {
  const [emVoo, setEmVoo] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);
  const cancelarRef = React.useRef<HTMLButtonElement>(null);

  const confirmar = async () => {
    if (emVoo) return;
    setEmVoo(true);
    setErro(null);
    try {
      await onConfirmar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível concluir. Tente de novo.");
    } finally {
      setEmVoo(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(aberto) => {
        if (emVoo) return; // fechar bloqueado durante a confirmação em voo
        if (!aberto) setErro(null);
        onOpenChange(aberto);
      }}
    >
      <DialogContent
        className="sm:max-w-md"
        initialFocus={destrutivo ? cancelarRef : undefined}
      >
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>{descricao}</DialogDescription>
        </DialogHeader>
        {erro && (
          <div
            role="alert"
            className="rounded-xl border border-destructive/30 bg-destructive/10 text-destructive text-sm px-4 py-3 flex items-center gap-2"
          >
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {erro}
          </div>
        )}
        <DialogFooter>
          <Button
            ref={cancelarRef}
            variant="outline"
            disabled={emVoo}
            onClick={() => onOpenChange(false)}
          >
            {textoCancelar}
          </Button>
          <Button
            variant={destrutivo ? "destructive" : "default"}
            disabled={emVoo}
            aria-busy={emVoo}
            onClick={confirmar}
          >
            {emVoo && <Loader2 className="h-4 w-4 animate-spin" />}
            {emVoo && textoOcupado ? textoOcupado : textoConfirmar}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
