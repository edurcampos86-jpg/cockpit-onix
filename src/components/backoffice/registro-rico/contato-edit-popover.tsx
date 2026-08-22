"use client";

import { useState } from "react";
import { CalendarClock, Loader2, Users } from "lucide-react";

/**
 * Ajuste manual da data de contato, na própria linha do cliente.
 *
 * Existe para o contato que aconteceu FORA do sistema — corredor, aniversário,
 * ligação no celular pessoal. Hoje o único jeito de registrar isso é inventar
 * uma interação com assunto e duração que ninguém mediu, e a alternativa que
 * as pessoas escolhem é não registrar: o cliente aparece vencido e ninguém
 * sabe que já foi falado.
 *
 * O seletor de escopo é a decisão importante da tela, e por isso é explícito:
 * "só esta conta" é o default e "todo o grupo" avisa quantas contas serão
 * movidas ANTES do clique. Propagação silenciosa seria a pior forma de acertar.
 */

export type GrupoDoCliente = {
  id: string;
  nome: string;
  /** Quantos membros recebem propagação (viaGrupo=true) — o número que a tela mostra. */
  membrosQueRecebem: number;
};

export function ContatoEditPopover({
  clienteId,
  ultimoContatoAt,
  grupo,
  onSalvo,
}: {
  clienteId: string;
  ultimoContatoAt: string | null;
  grupo?: GrupoDoCliente | null;
  onSalvo?: (r: { atualizados: string[]; naoRegrediram: string[] }) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [data, setData] = useState(() => paraInputDate(ultimoContatoAt));
  const [motivo, setMotivo] = useState("");
  const [escopo, setEscopo] = useState<"individual" | "grupo">("individual");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar() {
    setSalvando(true);
    setErro(null);
    try {
      const res = await fetch(`/api/backoffice/clientes/${clienteId}/contato`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ultimoContatoAt: data ? new Date(`${data}T12:00:00`).toISOString() : null,
          motivo: motivo.trim() || undefined,
          escopo,
          grupoId: escopo === "grupo" ? grupo?.id : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErro(json.error ?? "Não foi possível salvar");
        return;
      }
      onSalvo?.(json);
      setAberto(false);
    } catch {
      setErro("Falha de rede. Tente de novo.");
    } finally {
      setSalvando(false);
    }
  }

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <CalendarClock className="h-3.5 w-3.5" aria-hidden />
        Ajustar contato
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-3 text-sm w-72">
      <div className="space-y-1">
        <label htmlFor="data-contato" className="text-xs font-medium text-muted-foreground">
          Quando foi o contato
        </label>
        <input
          id="data-contato"
          type="date"
          value={data}
          onChange={(e) => setData(e.target.value)}
          className="w-full rounded border border-border bg-background px-2 py-1"
        />
        {/* Data anterior à atual não é erro — o servidor guarda no histórico e
            não move o campo. Avisar antes evita a impressão de que não salvou. */}
        {ehRegressao(data, ultimoContatoAt) && (
          <p className="text-[11px] text-amber-600 dark:text-amber-500">
            Essa data é anterior ao último contato registrado. Vai ficar no histórico, mas a data
            do cliente não retrocede.
          </p>
        )}
      </div>

      <div className="space-y-1">
        <label htmlFor="motivo-contato" className="text-xs font-medium text-muted-foreground">
          Por quê (opcional)
        </label>
        <input
          id="motivo-contato"
          type="text"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="ex.: falei no aniversário do filho"
          className="w-full rounded border border-border bg-background px-2 py-1"
        />
      </div>

      {grupo && (
        <fieldset className="space-y-1">
          <legend className="text-xs font-medium text-muted-foreground">Aplicar em</legend>
          <label className="flex items-center gap-2 text-xs">
            <input
              type="radio"
              name="escopo"
              checked={escopo === "individual"}
              onChange={() => setEscopo("individual")}
            />
            Só esta conta
          </label>
          <label className="flex items-center gap-2 text-xs">
            <input
              type="radio"
              name="escopo"
              checked={escopo === "grupo"}
              onChange={() => setEscopo("grupo")}
            />
            <Users className="h-3 w-3" aria-hidden />
            {grupo.nome} — {grupo.membrosQueRecebem}{" "}
            {grupo.membrosQueRecebem === 1 ? "conta" : "contas"}
          </label>
        </fieldset>
      )}

      {erro && <p className="text-xs text-destructive">{erro}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={salvar}
          disabled={salvando}
          className="inline-flex items-center gap-1 rounded bg-primary px-3 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"
        >
          {salvando && <Loader2 className="h-3 w-3 animate-spin" aria-hidden />}
          Salvar
        </button>
        <button
          type="button"
          onClick={() => setAberto(false)}
          className="rounded px-3 py-1 text-xs text-muted-foreground hover:text-foreground"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

function paraInputDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function ehRegressao(dataInput: string, atualIso: string | null): boolean {
  if (!dataInput || !atualIso) return false;
  const nova = new Date(`${dataInput}T12:00:00`);
  const atual = new Date(atualIso);
  if (Number.isNaN(nova.getTime()) || Number.isNaN(atual.getTime())) return false;
  return nova.getTime() <= atual.getTime();
}
