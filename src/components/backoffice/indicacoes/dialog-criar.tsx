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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getNomeRelacionamento } from "@/lib/backoffice/display-name";
import type { ClienteOpcao, ParceiroOpcao, Indicacao } from "./tipos";

/* Valor do select carrega o tipo (`cliente:<id>` / `parceiro:<id>`) — sem
 * prefixo, um id de cliente e um de parceiro seriam indistinguíveis (ambos
 * cuid). Mesmo modelo do caminho antigo. */
function separarOrigem(valor: string): { indicadorId: string | null; parceiroId: string | null } {
  if (valor.startsWith("cliente:")) return { indicadorId: valor.slice(8), parceiroId: null };
  if (valor.startsWith("parceiro:")) return { indicadorId: null, parceiroId: valor.slice(9) };
  return { indicadorId: null, parceiroId: null };
}

const FORM_VAZIO = {
  origem: "",
  nomeIndicado: "",
  telefoneIndicado: "",
  emailIndicado: "",
  valorEstimado: "",
  notas: "",
};

export function DialogCriar({
  open,
  onOpenChange,
  clientes,
  parceiros,
  onCriada,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientes: ClienteOpcao[];
  parceiros: ParceiroOpcao[];
  onCriada: (nova: Indicacao) => void;
}) {
  const [form, setForm] = React.useState(FORM_VAZIO);
  const [criandoEmVoo, setCriandoEmVoo] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);

  const salvar = async () => {
    // É esta guarda que mata o duplo-clique: retorna cedo se já em voo.
    if (criandoEmVoo || !form.nomeIndicado.trim()) return;
    setCriandoEmVoo(true);
    setErro(null);
    try {
      const origem = separarOrigem(form.origem);
      const res = await fetch("/api/backoffice/indicacoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nomeIndicado: form.nomeIndicado.trim(),
          emailIndicado: form.emailIndicado || null,
          telefoneIndicado: form.telefoneIndicado || null,
          valorEstimado: form.valorEstimado ? Number(form.valorEstimado) : null,
          notas: form.notas || null,
          ...origem,
        }),
      });
      if (!res.ok) throw new Error();
      const nova = await res.json();
      const indicador = clientes.find((c) => c.id === origem.indicadorId);
      const parceiro = parceiros.find((p) => p.id === origem.parceiroId);
      onCriada({
        id: nova.id,
        nomeIndicado: nova.nomeIndicado,
        emailIndicado: nova.emailIndicado ?? null,
        telefoneIndicado: nova.telefoneIndicado ?? null,
        status: nova.status ?? "recebida",
        valorEstimado: nova.valorEstimado ?? null,
        agradecimentoEnviado: nova.agradecimentoEnviado ?? false,
        notas: nova.notas ?? null,
        criadoEm: nova.criadoEm ?? new Date().toISOString(),
        clienteConvertidoId: nova.clienteConvertidoId ?? null,
        indicador: indicador
          ? { id: indicador.id, nome: indicador.nome, classificacao: indicador.classificacao }
          : null,
        parceiro: parceiro ?? null,
      });
      setForm(FORM_VAZIO);
      onOpenChange(false);
    } catch {
      setErro(
        "Não foi possível registrar — nada foi salvo. Confira a conexão e toque em Registrar introdução de novo."
      );
    } finally {
      setCriandoEmVoo(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(aberto) => {
        if (criandoEmVoo) return; // fechar bloqueado durante o salvamento
        if (!aberto) setErro(null);
        onOpenChange(aberto);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nova introdução</DialogTitle>
          <DialogDescription>De quem veio e quem é a pessoa apresentada.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="criar-origem">Quem fez a introdução</Label>
            <Select
              value={form.origem || null}
              onValueChange={(v) => setForm({ ...form, origem: (v as string) ?? "" })}
            >
              <SelectTrigger id="criar-origem" className="w-full">
                <SelectValue placeholder="Escolher cliente ou parceiro (opcional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Ninguém / anotar depois</SelectItem>
                {parceiros.length > 0 && (
                  <SelectGroup>
                    <SelectLabel>Parceiros</SelectLabel>
                    {parceiros.map((p) => (
                      <SelectItem key={p.id} value={`parceiro:${p.id}`}>
                        {p.nome}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
                <SelectGroup>
                  <SelectLabel>Clientes</SelectLabel>
                  {clientes.map((c) => (
                    <SelectItem key={c.id} value={`cliente:${c.id}`}>
                      [{c.classificacao}] {getNomeRelacionamento(c)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="criar-nome">Nome de quem foi apresentado *</Label>
            <Input
              id="criar-nome"
              value={form.nomeIndicado}
              onChange={(e) => setForm({ ...form, nomeIndicado: e.target.value })}
              placeholder="Ex.: Ricardo Mendes"
              required
              aria-required="true"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="criar-telefone">WhatsApp (com DDD)</Label>
            <Input
              id="criar-telefone"
              type="tel"
              inputMode="tel"
              value={form.telefoneIndicado}
              onChange={(e) => setForm({ ...form, telefoneIndicado: e.target.value })}
              placeholder="(71) 99999-0000"
            />
            <p className="text-xs text-muted-foreground">
              Com o número salvo, o convite sai daqui em um toque.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="criar-email">E-mail</Label>
            <Input
              id="criar-email"
              type="email"
              value={form.emailIndicado}
              onChange={(e) => setForm({ ...form, emailIndicado: e.target.value })}
              placeholder="nome@exemplo.com"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="criar-valor">Potencial estimado (R$)</Label>
            <Input
              id="criar-valor"
              type="number"
              min="0"
              value={form.valorEstimado}
              onChange={(e) => setForm({ ...form, valorEstimado: e.target.value })}
              placeholder="500000"
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="criar-notas">Contexto da introdução</Label>
            <Textarea
              id="criar-notas"
              rows={3}
              value={form.notas}
              onChange={(e) => setForm({ ...form, notas: e.target.value })}
              placeholder="Onde se conheceram, do que essa pessoa gosta, família, hobby..."
            />
          </div>
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
          <Button variant="ghost" disabled={criandoEmVoo} onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            disabled={criandoEmVoo || !form.nomeIndicado.trim()}
            aria-busy={criandoEmVoo}
            onClick={salvar}
          >
            {criandoEmVoo && <Loader2 className="h-4 w-4 animate-spin" />}
            {criandoEmVoo ? "Registrando..." : "Registrar introdução"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
