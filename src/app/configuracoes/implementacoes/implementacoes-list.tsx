"use client";

import Link from "next/link";
import { useMemo, useRef, useState, useTransition } from "react";
import { Plus, Paperclip, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { calcRiceScore } from "@/lib/rice";
import {
  atualizarRice,
  atualizarStatus,
  removerAnexo,
} from "@/app/actions/implementacao";
import { RiceHelp } from "./rice-help";

export type AnexoDTO = {
  id: string;
  nomeArquivo: string;
  contentType: string;
};

export type ImplementacaoDTO = {
  id: string;
  empresaId: string;
  tipo: string;
  porQue: string;
  como: string | null;
  oQue: string;
  printUrl: string | null;
  anexos: AnexoDTO[];
  reach: number | null;
  impact: number | null;
  confidence: number | null;
  effort: number | null;
  score: number | null;
  status: string;
  createdAt: string;
};

const STATUSES = [
  "triagem",
  "aprovada",
  "em-andamento",
  "concluida",
  "recusada",
] as const;

const STATUS_STYLE: Record<string, string> = {
  triagem: "bg-muted text-muted-foreground",
  aprovada: "bg-primary/15 text-primary",
  "em-andamento": "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  concluida: "bg-green-500/15 text-green-600 dark:text-green-400",
  recusada: "bg-destructive/15 text-destructive",
};

const TIPO_LABEL: Record<string, string> = {
  melhoria: "Melhoria",
  erro: "Erro",
  ideia: "Ideia",
};

function RiceInput({
  value,
  onCommit,
}: {
  value: number | null;
  onCommit: (v: number | null) => void;
}) {
  const [local, setLocal] = useState(value?.toString() ?? "");
  return (
    <input
      type="number"
      min={0}
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => {
        const n = local === "" ? null : Number(local);
        onCommit(n != null && Number.isNaN(n) ? null : n);
      }}
      className="w-14 rounded-md border border-border bg-background px-1.5 py-1 text-center text-xs tabular-nums focus:border-primary focus:outline-none"
    />
  );
}

export function ImplementacoesList({
  itens,
  empresas,
}: {
  itens: ImplementacaoDTO[];
  empresas: { id: string; nome: string }[];
}) {
  const [rows, setRows] = useState<ImplementacaoDTO[]>(itens);
  const [fEmpresa, setFEmpresa] = useState<string>("todas");
  const [fStatus, setFStatus] = useState<string>("todos");
  const [, startTransition] = useTransition();

  // Espelho autoritativo do estado mais recente. `rows` no closure de um handler
  // reflete o render que o criou; se vários commits acontecem no MESMO tick (sem
  // re-render entre eles), o closure fica defasado. O ref é atualizado de forma
  // síncrona dentro de cada commit (única origem de mudança de `rows`), então o
  // commit seguinte do mesmo tick já enxerga o valor anterior — evitando que
  // payloads parciais (com fatores ainda nulos) sobrescrevam uns aos outros.
  const rowsRef = useRef(rows);

  const visiveis = useMemo(() => {
    const filtered = rows.filter(
      (r) =>
        (fEmpresa === "todas" || r.empresaId === fEmpresa) &&
        (fStatus === "todos" || r.status === fStatus),
    );
    return filtered.sort((a, b) => {
      // score desc, nulls por último
      if (a.score == null && b.score == null) return 0;
      if (a.score == null) return 1;
      if (b.score == null) return -1;
      return b.score - a.score;
    });
  }, [rows, fEmpresa, fStatus]);

  function commitRice(id: string, patch: Partial<ImplementacaoDTO>) {
    // Compõe a partir do estado MAIS RECENTE (ref), não do snapshot do closure.
    const next = rowsRef.current.map((r) => {
      if (r.id !== id) return r;
      const merged = { ...r, ...patch };
      merged.score = calcRiceScore(
        merged.reach,
        merged.impact,
        merged.confidence,
        merged.effort,
      );
      return merged;
    });
    rowsRef.current = next; // visível para o próximo commit do mesmo tick
    setRows(next);

    const row = next.find((r) => r.id === id)!;
    startTransition(() =>
      atualizarRice(id, {
        reach: row.reach,
        impact: row.impact,
        confidence: row.confidence,
        effort: row.effort,
      }),
    );
  }

  function commitStatus(id: string, status: string) {
    const next = rowsRef.current.map((r) =>
      r.id === id ? { ...r, status } : r,
    );
    rowsRef.current = next; // mantém o ref autoritativo entre commits do mesmo tick
    setRows(next);
    startTransition(() => atualizarStatus(id, status));
  }

  // Remove um anexo salvo: otimista na UI, server apaga linha + objeto no B2.
  function removerAnexoRow(implId: string, anexoId: string) {
    if (!confirm("Remover este anexo? Isso apaga o arquivo definitivamente.")) {
      return;
    }
    const next = rowsRef.current.map((r) =>
      r.id === implId
        ? { ...r, anexos: r.anexos.filter((a) => a.id !== anexoId) }
        : r,
    );
    rowsRef.current = next;
    setRows(next);
    startTransition(async () => {
      await removerAnexo(anexoId);
    });
  }

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Implementações</h1>
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            Central Golden Circle · priorização RICE
            <RiceHelp />
          </p>
        </div>
        <Link
          href="/configuracoes/implementacoes/nova?empresa=investimentos"
          className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          Nova
        </Link>
      </div>

      {/* Filtros */}
      <div className="mb-4 flex flex-wrap gap-2">
        <select
          value={fEmpresa}
          onChange={(e) => setFEmpresa(e.target.value)}
          className="rounded-md border border-border bg-background px-3 py-1.5 text-sm"
        >
          <option value="todas">Todas as empresas</option>
          {empresas.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nome}
            </option>
          ))}
        </select>
        <select
          value={fStatus}
          onChange={(e) => setFStatus(e.target.value)}
          className="rounded-md border border-border bg-background px-3 py-1.5 text-sm"
        >
          <option value="todos">Todos os status</option>
          {STATUSES.map((st) => (
            <option key={st} value={st}>
              {st}
            </option>
          ))}
        </select>
      </div>

      {visiveis.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          Nenhuma implementação ainda. Clique em <strong>Nova</strong> para começar.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-semibold">Pedido (O quê)</th>
                <th className="px-3 py-2 font-semibold">Tipo</th>
                <th className="px-2 py-2 text-center font-semibold" title="Reach">R</th>
                <th className="px-2 py-2 text-center font-semibold" title="Impact">I</th>
                <th className="px-2 py-2 text-center font-semibold" title="Confidence">C</th>
                <th className="px-2 py-2 text-center font-semibold" title="Effort">E</th>
                <th className="px-3 py-2 text-right font-semibold">Score</th>
                <th className="px-3 py-2 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((r) => (
                <tr key={r.id} className="border-t border-border align-top">
                  <td className="max-w-xs px-3 py-2">
                    <p className="font-medium text-foreground">{r.oQue}</p>
                    <p className="line-clamp-2 text-xs text-muted-foreground">
                      <span className="font-semibold">Por quê:</span> {r.porQue}
                    </p>
                    {r.anexos.length > 0 ? (
                      <div className="mt-1.5">
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary">
                          <Paperclip className="h-3 w-3" />
                          {r.anexos.length}{" "}
                          {r.anexos.length === 1 ? "anexo" : "anexos"}
                        </span>
                        <ul className="mt-1 flex flex-wrap gap-1">
                          {r.anexos.map((a) => (
                            <li
                              key={a.id}
                              className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-1.5 py-0.5 text-[10px]"
                            >
                              <a
                                href={`/api/configuracoes/implementacoes/anexos/${a.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                title={a.nomeArquivo}
                                className="max-w-[110px] truncate font-medium text-foreground hover:text-primary hover:underline"
                              >
                                {a.nomeArquivo}
                              </a>
                              <button
                                type="button"
                                onClick={() => removerAnexoRow(r.id, a.id)}
                                aria-label={`Remover ${a.nomeArquivo}`}
                                className="text-muted-foreground transition-colors hover:text-destructive"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : (
                      r.printUrl && (
                        <a
                          href={`/api/configuracoes/implementacoes/${r.id}/print`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                        >
                          <Paperclip className="h-3 w-3" />
                          Ver print
                        </a>
                      )
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {TIPO_LABEL[r.tipo] ?? r.tipo}
                  </td>
                  <td className="px-2 py-2 text-center">
                    <RiceInput value={r.reach} onCommit={(v) => commitRice(r.id, { reach: v })} />
                  </td>
                  <td className="px-2 py-2 text-center">
                    <RiceInput value={r.impact} onCommit={(v) => commitRice(r.id, { impact: v })} />
                  </td>
                  <td className="px-2 py-2 text-center">
                    <RiceInput
                      value={r.confidence}
                      onCommit={(v) => commitRice(r.id, { confidence: v })}
                    />
                  </td>
                  <td className="px-2 py-2 text-center">
                    <RiceInput value={r.effort} onCommit={(v) => commitRice(r.id, { effort: v })} />
                  </td>
                  <td className="px-3 py-2 text-right font-bold tabular-nums text-foreground">
                    {r.score != null ? r.score : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={r.status}
                      onChange={(e) => commitStatus(r.id, e.target.value)}
                      className={cn(
                        "rounded-full px-2 py-1 text-xs font-semibold",
                        STATUS_STYLE[r.status] ?? "bg-muted text-muted-foreground",
                      )}
                    >
                      {STATUSES.map((st) => (
                        <option key={st} value={st}>
                          {st}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
