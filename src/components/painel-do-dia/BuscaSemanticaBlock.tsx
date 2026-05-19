"use client";

import { useState } from "react";
import {
  ExternalLink,
  Loader2,
  Search,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

/**
 * Busca full-text + rerank Claude no inbox classificado (PainelEmailAI).
 * v1 = caixa de busca simples no topo do Painel do Dia. Sem filtros UI ainda
 * (a API ja aceita filtros, expomos depois se precisar).
 */

type Resultado = {
  id: string;
  assunto: string;
  remetente: string;
  snippet: string;
  recebidoEm: string;
  link: string;
  clienteVinculadoId?: string;
  motivo: string;
};

type Resposta = {
  resultados: Resultado[];
  total: number;
  rerankUsado: boolean;
};

function formatarData(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "short",
    });
  } catch {
    return "";
  }
}

export function BuscaSemanticaBlock() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [resposta, setResposta] = useState<Resposta | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function buscar() {
    const q = query.trim();
    if (q.length === 0) return;
    setLoading(true);
    setErro(null);
    setResposta(null);
    try {
      const res = await fetch("/api/painel-do-dia/email/buscar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErro(data.error ?? `HTTP ${res.status}`);
        return;
      }
      setResposta(data as Resposta);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Falha na busca");
    } finally {
      setLoading(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      buscar();
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Search className="h-5 w-5" /> Busca nos e-mails
          {resposta?.rerankUsado && (
            <Badge variant="outline" className="h-5 gap-1 text-[10px]">
              <Sparkles className="h-3 w-3" /> rerank IA
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Input
            type="search"
            placeholder='Ex.: "proposta XP", "reuniao Maria", "previdencia"'
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={loading}
            className="flex-1"
          />
          <Button onClick={buscar} disabled={loading || query.trim().length === 0}>
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            Buscar
          </Button>
        </div>

        {erro && (
          <p className="text-sm text-destructive">Erro: {erro}</p>
        )}

        {resposta && !erro && (
          <ResultadosLista resposta={resposta} />
        )}
      </CardContent>
    </Card>
  );
}

function ResultadosLista({ resposta }: { resposta: Resposta }) {
  if (resposta.resultados.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhum e-mail encontrado. Tente outra busca.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        {resposta.resultados.length} de {resposta.total} candidatos
        {!resposta.rerankUsado && " (rerank Claude indisponivel — ranking basico)"}
      </p>
      <ul className="flex flex-col gap-2">
        {resposta.resultados.map((r) => (
          <li
            key={r.id}
            className="rounded-md ring-1 ring-foreground/10 p-3"
          >
            <div className="mb-1 flex items-center justify-between gap-2">
              <p className="text-sm font-medium truncate">{r.remetente}</p>
              <span className="text-[10px] text-muted-foreground tabular-nums">
                {formatarData(r.recebidoEm)}
              </span>
            </div>
            <a
              href={r.link}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
            >
              {r.assunto}
              <ExternalLink className="h-3 w-3" />
            </a>
            <p className="text-xs text-muted-foreground line-clamp-2">
              {r.snippet}
            </p>
            <p className="mt-1 text-xs italic text-amber-800 dark:text-amber-300">
              <Sparkles className="inline h-3 w-3" /> {r.motivo}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
