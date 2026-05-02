"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Users } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type {
  AcaoUnificada,
  EncerrarAcaoInput,
} from "@/lib/painel-do-dia/types";

type ClienteMini = {
  id: string;
  nome: string;
  classificacao?: string | null;
};

/**
 * Modal de encerramento de uma acao (Sugestao 4 do Painel do Dia).
 *
 * Coleta: resultado, tempo gasto, vinculo de cliente (com autocomplete),
 * proximo passo (follow-up) e flag de registrar no CRM.
 * Posta para POST /api/painel-do-dia/acoes/[id]/encerrar.
 */
export function FecharAtividadeModal({
  acao,
  open,
  onOpenChange,
}: {
  acao: AcaoUnificada | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [resultado, setResultado] = useState("");
  const [tempoGastoMin, setTempoGastoMin] = useState<string>("");
  const [clienteQuery, setClienteQuery] = useState("");
  const [clienteSelecionado, setClienteSelecionado] =
    useState<ClienteMini | null>(null);
  const [proximoPasso, setProximoPasso] = useState("");
  const [registrarCrm, setRegistrarCrm] = useState(true);
  const [clientes, setClientes] = useState<ClienteMini[]>([]);
  const [carregandoClientes, setCarregandoClientes] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [isPending, start] = useTransition();
  const [submitting, setSubmitting] = useState(false);

  // Carrega clientes uma vez quando o modal abre
  useEffect(() => {
    if (!open) return;
    setCarregandoClientes(true);
    fetch("/api/backoffice/clientes")
      .then((r) => r.json())
      .then((data: { clientes?: ClienteMini[] }) => {
        setClientes(data.clientes ?? []);
      })
      .catch((e) => {
        console.error("Falha ao carregar clientes", e);
      })
      .finally(() => setCarregandoClientes(false));
  }, [open]);

  // Reset ao fechar
  useEffect(() => {
    if (!open) {
      setResultado("");
      setTempoGastoMin("");
      setClienteQuery("");
      setClienteSelecionado(null);
      setProximoPasso("");
      setRegistrarCrm(true);
      setErro(null);
    }
  }, [open]);

  const sugestoesClientes = useMemo(() => {
    const q = clienteQuery.trim().toLowerCase();
    if (!q || clienteSelecionado) return [];
    return clientes
      .filter((c) => c.nome.toLowerCase().includes(q))
      .slice(0, 6);
  }, [clienteQuery, clientes, clienteSelecionado]);

  async function handleSubmit() {
    if (!acao) return;
    setSubmitting(true);
    setErro(null);
    const body: EncerrarAcaoInput = {
      resultado: resultado.trim() || undefined,
      tempoGastoMin: tempoGastoMin ? Number(tempoGastoMin) : undefined,
      clienteVinculadoId: clienteSelecionado?.id,
      proximoPasso: proximoPasso.trim() || undefined,
      registrarCrm: registrarCrm && !!clienteSelecionado,
    };
    try {
      const res = await fetch(
        `/api/painel-do-dia/acoes/${acao.id}/encerrar`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      onOpenChange(false);
      start(() => router.refresh());
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao encerrar atividade");
    } finally {
      setSubmitting(false);
    }
  }

  const disabledSubmit = submitting || isPending || !acao;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-primary" />
            Encerrar atividade
          </DialogTitle>
          <DialogDescription>
            {acao ? acao.titulo : "Selecione uma atividade"}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="resultado">Resultado / notas</Label>
            <Textarea
              id="resultado"
              placeholder="O que foi decidido? Proximos passos do outro lado?"
              value={resultado}
              onChange={(e) => setResultado(e.target.value)}
              className="min-h-20"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tempo">Tempo gasto (min)</Label>
              <Input
                id="tempo"
                type="number"
                min={0}
                placeholder="30"
                value={tempoGastoMin}
                onChange={(e) => setTempoGastoMin(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Cliente vinculado</Label>
              {clienteSelecionado ? (
                <div className="flex items-center justify-between rounded-md border border-input bg-muted/40 px-2 py-1.5">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <Users className="h-3 w-3 shrink-0 text-muted-foreground" />
                    <span className="truncate text-sm">
                      {clienteSelecionado.nome}
                    </span>
                    {clienteSelecionado.classificacao && (
                      <Badge
                        variant="outline"
                        className="h-4 px-1 text-[10px]"
                      >
                        {clienteSelecionado.classificacao}
                      </Badge>
                    )}
                  </div>
                  <button
                    type="button"
                    className="text-[10px] text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      setClienteSelecionado(null);
                      setClienteQuery("");
                    }}
                  >
                    trocar
                  </button>
                </div>
              ) : (
                <Input
                  placeholder={
                    carregandoClientes ? "Carregando..." : "Buscar cliente..."
                  }
                  value={clienteQuery}
                  onChange={(e) => setClienteQuery(e.target.value)}
                  disabled={carregandoClientes}
                />
              )}
            </div>
          </div>

          {sugestoesClientes.length > 0 && (
            <ul className="-mt-1 flex max-h-40 flex-col gap-0.5 overflow-auto rounded-md border bg-popover p-1">
              {sugestoesClientes.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1 text-left text-sm hover:bg-accent"
                    onClick={() => {
                      setClienteSelecionado(c);
                      setClienteQuery("");
                    }}
                  >
                    <span className="truncate">{c.nome}</span>
                    {c.classificacao && (
                      <Badge
                        variant="outline"
                        className="h-4 px-1 text-[10px]"
                      >
                        {c.classificacao}
                      </Badge>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}

          <label
            className={cn(
              "flex items-start gap-2 rounded-md border p-2 text-sm",
              !clienteSelecionado && "opacity-50"
            )}
          >
            <Checkbox
              checked={registrarCrm}
              onCheckedChange={(v) => setRegistrarCrm(v === true)}
              disabled={!clienteSelecionado}
              className="mt-0.5"
            />
            <div className="flex-1">
              <p className="font-medium">Registrar no CRM</p>
              <p className="text-xs text-muted-foreground">
                {acao?.registradaCrm
                  ? "Ja existe registro no CRM para essa acao."
                  : "Cria uma InteracaoCliente no CRM e atualiza o ultimo contato."}
              </p>
            </div>
          </label>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="proximo">Proximo passo (opcional)</Label>
            <Input
              id="proximo"
              placeholder="Ex: Enviar proposta ate sexta"
              value={proximoPasso}
              onChange={(e) => setProximoPasso(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">
              Se preenchido, vira uma nova acao Q2 no Painel.
            </p>
          </div>

          {erro && (
            <p className="rounded-md border border-destructive/30 bg-destructive/5 px-2 py-1.5 text-xs text-destructive">
              {erro}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={disabledSubmit}>
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Encerrando...
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4" /> Encerrar
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
