"use client";

import { AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

/**
 * Banner de risco de evasão no painel.
 *
 * Mostra clientes SEM reunião agendada cujo teto da classe já venceu
 * (A=90d, B=120d, C=180d, ou o teto manual do cliente). É o mesmo estado
 * "risco" que a tabela de clientes pinta — a regra vive em cadencia-core.ts e
 * é calculada no server; aqui só se exibe.
 *
 * Segue o padrão de OverdueTasksBanner: some quando não há nada (nada de
 * "0 clientes em risco" ocupando espaço no painel todo dia), e abre a lista
 * ao clique.
 */

export interface ClienteEmRisco {
  id: string;
  nome: string;
  classificacao: string;
  diasVencidos: number;
  teto: number;
  tetoManual: boolean;
}

export function RiscoEvasaoBanner({ clientes }: { clientes: ClienteEmRisco[] }) {
  const [expanded, setExpanded] = useState(false);

  if (clientes.length === 0) return null;

  // Mais vencido primeiro: quem está há mais tempo sem reunião é quem corre
  // mais risco de já ter ido embora sem avisar.
  const ordenados = [...clientes].sort((a, b) => b.diasVencidos - a.diasVencidos);

  return (
    <div className="bg-red-500/5 border border-red-500/20 rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-5 py-3 hover:bg-red-500/5 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-red-500/10">
            <AlertTriangle className="h-4 w-4 text-red-400" />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-red-400">
              {clientes.length}{" "}
              {clientes.length === 1
                ? "cliente sem reunião agendada"
                : "clientes sem reunião agendada"}
            </p>
            <p className="text-xs text-muted-foreground">
              Passaram do teto da classe — risco de evasão
            </p>
          </div>
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-red-500/20 divide-y divide-red-500/10">
          {ordenados.map((c) => (
            <Link
              key={c.id}
              href={`/empresas/investimentos/clientes/${c.id}`}
              className="flex items-center justify-between px-5 py-2.5 hover:bg-red-500/5 transition-colors"
            >
              <span className="text-sm">
                {c.nome}
                <span className="ml-2 text-xs text-muted-foreground">
                  classe {c.classificacao}
                </span>
              </span>
              <span className="text-xs font-semibold text-red-400">
                {c.diasVencidos}d vencida
                <span className="ml-1 font-normal text-muted-foreground">
                  (teto {c.teto}d{c.tetoManual ? " manual" : ""})
                </span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
