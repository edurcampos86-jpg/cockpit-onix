"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/* ──────────────────────────────────────────────────────────────
 * Confirmação para ação que muda estado sem volta óbvia.
 *
 * ── POR QUE UM COMPONENTE, E NÃO `confirm()` ─────────────────────────────
 * O `window.confirm` não deixa explicar a CONSEQUÊNCIA — e é a consequência
 * que a pessoa precisa ler antes de clicar. Aqui o texto do que vai acontecer
 * é obrigatório (`consequencia`), então nenhuma ação destrutiva entra no app
 * sem alguém ter escrito o que ela faz.
 *
 * O formulário e a Server Action ficam DENTRO do modal: o clique de confirmar
 * é o submit, não um callback que dispara outra coisa. Isso mantém o botão
 * funcionando como botão de formulário e não guarda estado do servidor no
 * cliente — nada de Prisma atravessa para cá.
 * ────────────────────────────────────────────────────────────── */

export function ConfirmarAcao({
  titulo,
  consequencia,
  rotuloGatilho,
  rotuloConfirmar,
  action,
  campos,
  destrutivo = false,
  iconeGatilho,
}: {
  titulo: string;
  /** O que acontece se confirmar. Frase inteira, na voz de quem opera. */
  consequencia: string;
  rotuloGatilho: string;
  rotuloConfirmar: string;
  action: (formData: FormData) => void | Promise<void>;
  /** Campos ocultos do formulário (ids, flags). */
  campos: Record<string, string>;
  destrutivo?: boolean;
  iconeGatilho?: React.ReactNode;
}) {
  const [aberto, setAberto] = React.useState(false);

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger
        className={
          destrutivo
            ? "inline-flex items-center gap-1.5 rounded-lg border border-destructive/40 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-destructive"
            : "inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--parceiro-ouro)]"
        }
      >
        {iconeGatilho}
        {rotuloGatilho}
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>{consequencia}</DialogDescription>
        </DialogHeader>
        <form action={action} onSubmit={() => setAberto(false)}>
          {Object.entries(campos).map(([nome, valor]) => (
            <input key={nome} type="hidden" name={nome} value={valor} />
          ))}
          <DialogFooter>
            <button
              type="button"
              onClick={() => setAberto(false)}
              className="rounded-lg border border-border px-3 py-2 text-sm text-foreground hover:bg-accent"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className={
                destrutivo
                  ? "rounded-lg bg-destructive px-3 py-2 text-sm font-semibold text-white hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-destructive"
                  : "rounded-lg border border-[var(--parceiro-borda)] bg-[var(--parceiro-faixa)] px-3 py-2 text-sm font-semibold text-foreground hover:bg-[var(--parceiro-borda)]"
              }
            >
              {rotuloConfirmar}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
