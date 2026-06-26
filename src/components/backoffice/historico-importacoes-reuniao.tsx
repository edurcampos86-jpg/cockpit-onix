"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, FileText, History, Loader2 } from "lucide-react";

/** Evento disparado pelo ImportarReuniaoForm ao salvar — dispara o refetch. */
export const EVENTO_REUNIAO_IMPORTADA = "reuniao-importada";

type ImportItem = {
  id: string;
  fonte: string; // "texto" | "pdf"
  nomeArquivo: string | null;
  tamanhoBytes: number | null;
  temPdf: boolean;
  importadoEm: string; // ISO
  importadoPorNome: string | null;
  reuniaoEstruturadaId: string | null;
};

function fmtDataHora(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Histórico de importações de reunião de um cliente (texto/PDF + quando + quem).
 * Read-only; busca a list route ao montar e quando o form dispara o evento de
 * import. PDFs com binário armazenado têm link de download.
 */
export function HistoricoImportacoesReuniao({ clienteId }: { clienteId: string }) {
  const [itens, setItens] = useState<ImportItem[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/cockpit-reuniao/importacoes?clienteId=${encodeURIComponent(clienteId)}`,
      );
      const json = await res.json();
      if (!res.ok) {
        setErro(json?.error ?? "Não consegui carregar o histórico.");
        return;
      }
      setItens(Array.isArray(json.imports) ? json.imports : []);
      setErro(null);
    } catch {
      setErro("Falha de rede ao carregar o histórico.");
    } finally {
      setCarregando(false);
    }
  }, [clienteId]);

  useEffect(() => {
    carregar();
    function onImportada(e: Event) {
      const detail = (e as CustomEvent<{ clienteId?: string }>).detail;
      if (!detail?.clienteId || detail.clienteId === clienteId) carregar();
    }
    window.addEventListener(EVENTO_REUNIAO_IMPORTADA, onImportada);
    return () => window.removeEventListener(EVENTO_REUNIAO_IMPORTADA, onImportada);
  }, [carregar, clienteId]);

  if (carregando) {
    return (
      <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando histórico…
      </p>
    );
  }
  if (erro) {
    return <p className="text-sm text-destructive">{erro}</p>;
  }
  if (itens.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhuma importação registrada ainda.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border">
      {itens.map((i) => (
        <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              {i.fonte === "pdf" ? (
                <FileText className="h-4 w-4 text-primary" />
              ) : (
                <History className="h-4 w-4 text-primary" />
              )}
            </span>
            <div>
              <p className="text-sm font-medium text-foreground">
                {i.fonte === "pdf" ? (i.nomeArquivo ?? "PDF") : "Texto colado"}
              </p>
              <p className="text-xs text-muted-foreground">
                {fmtDataHora(i.importadoEm)}
                {i.importadoPorNome ? ` · ${i.importadoPorNome}` : ""}
              </p>
            </div>
          </div>
          {i.temPdf && (
            <a
              href={`/api/cockpit-reuniao/importacoes/${i.id}/pdf`}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs text-foreground hover:bg-muted"
            >
              <Download className="h-3.5 w-3.5" /> Baixar PDF
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}
