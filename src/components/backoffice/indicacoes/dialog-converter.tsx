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
import { Label } from "@/components/ui/label";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { getNomeRelacionamento } from "@/lib/backoffice/display-name";
import type { ClienteOpcao, Indicacao } from "./tipos";

/**
 * "Registrar conversão" — vincula a introdução ao cadastro do cliente via
 * PATCH /converter existente (feito pelo board em `onVincular`, que mantém o
 * card em saving). A rota grava `clienteConvertidoId` E move o status para
 * "convertida" numa única escrita — não há segundo PATCH.
 */
export function DialogConverter({
  indicacao,
  clientes,
  onOpenChange,
  onVincular,
}: {
  /** `null` = fechado. */
  indicacao: Indicacao | null;
  clientes: ClienteOpcao[];
  onOpenChange: (open: boolean) => void;
  /** Lança erro (com mensagem para o usuário) quando o vínculo falha. */
  onVincular: (indicacao: Indicacao, clienteId: string) => Promise<void>;
}) {
  const [clienteId, setClienteId] = React.useState<string | null>(null);
  const [emVoo, setEmVoo] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);

  const confirmar = async () => {
    if (emVoo || !clienteId || !indicacao) return;
    setEmVoo(true);
    setErro(null);
    try {
      await onVincular(indicacao, clienteId);
      setClienteId(null);
      onOpenChange(false);
    } catch (e) {
      setErro(
        e instanceof Error && e.message
          ? e.message
          : "A conversão não foi salva. Escolha o cliente e confirme outra vez; se o cadastro ainda não existe, crie-o antes em Clientes."
      );
    } finally {
      setEmVoo(false);
    }
  };

  return (
    <Dialog
      open={indicacao !== null}
      onOpenChange={(aberto) => {
        if (emVoo) return; // fechar bloqueado durante o vínculo em voo
        if (!aberto) {
          setClienteId(null);
          setErro(null);
        }
        onOpenChange(aberto);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Registrar conversão</DialogTitle>
          <DialogDescription>
            Vincule esta introdução ao cadastro do novo cliente para fechar o ciclo. Dá para
            desfazer depois, sem perder nada.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label id="converter-label-cliente">Cadastro do novo cliente</Label>
          <Command
            aria-labelledby="converter-label-cliente"
            className="rounded-lg! border border-border"
          >
            <CommandInput placeholder="Buscar pelo nome..." />
            <CommandList className="max-h-56">
              <CommandEmpty>Nenhum cliente encontrado</CommandEmpty>
              {clientes.map((c) => (
                <CommandItem
                  key={c.id}
                  value={`${getNomeRelacionamento(c)} ${c.nome} ${c.nomeCompleto ?? ""}`}
                  data-checked={clienteId === c.id}
                  onSelect={() => setClienteId(clienteId === c.id ? null : c.id)}
                >
                  [{c.classificacao}] {getNomeRelacionamento(c)}
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        </div>

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
          <Button variant="ghost" disabled={emVoo} onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button disabled={emVoo || !clienteId} aria-busy={emVoo} onClick={confirmar}>
            {emVoo && <Loader2 className="h-4 w-4 animate-spin" />}
            {emVoo ? "Convertendo..." : "Confirmar conversão"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
