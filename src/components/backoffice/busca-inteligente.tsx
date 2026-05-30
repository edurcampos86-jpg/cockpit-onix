"use client";

import { useState } from "react";
import { Search, Sparkles, Loader2, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface ClienteResultado {
  id: string;
  nome: string;
  apelido: string | null;
  saldoConta: number;
  saldo: number;
  updatedAt: string;
}

interface BuscaResposta {
  query: string;
  filtros: Record<string, unknown>;
  resultados: ClienteResultado[];
  total: number;
  camposIgnorados: string[];
  usage: { inputTokens: number; outputTokens: number };
}

const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const fmtDataHora = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

// Rótulos amigáveis para os filtros (em vez de mostrar a chave bruta).
const ROTULO_FILTRO: Record<string, string> = {
  saldoCcMin: "Saldo CC ≥",
  saldoCcMax: "Saldo CC ≤",
  plMin: "PL ≥",
  plMax: "PL ≤",
  semMovimentacaoDias: "Sem mov. há",
  nomeContem: "Nome contém",
  ordenarPor: "Ordenar por",
  ordem: "Direção",
  limite: "Limite",
};

const CAMPOS_BRL = new Set(["saldoCcMin", "saldoCcMax", "plMin", "plMax"]);

function formatarValorFiltro(campo: string, valor: unknown): string {
  if (CAMPOS_BRL.has(campo) && typeof valor === "number") {
    return fmtBRL.format(valor);
  }
  if (campo === "semMovimentacaoDias" && typeof valor === "number") {
    return `${valor} dias`;
  }
  if (campo === "ordenarPor" && valor === "saldoCc") return "Saldo CC";
  if (campo === "ordenarPor" && valor === "pl") return "PL";
  if (campo === "ordenarPor" && valor === "nome") return "Nome";
  if (campo === "ordem" && valor === "desc") return "decrescente";
  if (campo === "ordem" && valor === "asc") return "crescente";
  return String(valor);
}

function nomeDeRelacionamento(c: ClienteResultado): string {
  // apelido > nome (alinhado com getNomeRelacionamento de display-name.ts)
  if (c.apelido && c.apelido.trim()) return c.apelido.trim();
  return c.nome;
}

const PLACEHOLDER =
  'Ex.: "clientes com saldo em CC acima de 50 mil parados ha 30 dias"';

export function BuscaInteligente() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resposta, setResposta] = useState<BuscaResposta | null>(null);

  async function executarBusca() {
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    setErro(null);
    setResposta(null);
    try {
      const res = await fetch("/api/backoffice/busca-inteligente", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) {
          setErro("Sessao expirou. Recarregue a pagina e faca login novamente.");
        } else if (res.status === 403) {
          setErro("Apenas administradores podem usar a busca inteligente.");
        } else {
          setErro(data?.detalhe || data?.error || "Falha ao executar a busca.");
        }
        return;
      }
      setResposta(data as BuscaResposta);
    } catch {
      setErro("Erro de rede. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  const filtrosEntries = resposta
    ? Object.entries(resposta.filtros).filter(([, v]) => v !== undefined)
    : [];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <CardTitle>Busca inteligente</CardTitle>
        </div>
        <CardDescription>
          Pergunte em portugues simples. O Claude traduz pra filtros estruturados sobre a base — voce ve exatamente o que ele entendeu antes dos resultados.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void executarBusca();
          }}
        >
          <Input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={PLACEHOLDER}
            disabled={loading}
            className="flex-1"
          />
          <Button type="submit" disabled={loading || !query.trim()}>
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Buscando
              </>
            ) : (
              <>
                <Search className="h-4 w-4" />
                Buscar
              </>
            )}
          </Button>
        </form>

        {erro && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{erro}</span>
          </div>
        )}

        {resposta && (
          <div className="space-y-3">
            {filtrosEntries.length > 0 && (
              <div>
                <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
                  Filtros interpretados
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {filtrosEntries.map(([campo, valor]) => (
                    <Badge key={campo} variant="secondary">
                      <span className="font-normal opacity-70">
                        {ROTULO_FILTRO[campo] ?? campo}
                      </span>
                      <span className="ml-1 font-medium">
                        {formatarValorFiltro(campo, valor)}
                      </span>
                    </Badge>
                  ))}
                </div>
                {resposta.camposIgnorados.length > 0 && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Campos ignorados (fora do vocabulario): {resposta.camposIgnorados.join(", ")}
                  </p>
                )}
              </div>
            )}

            <div className="flex items-baseline justify-between border-t pt-3">
              <p className="text-sm font-medium">
                {resposta.total === 0
                  ? "Nenhum cliente encontrado"
                  : `${resposta.resultados.length} de ${resposta.total} cliente${resposta.total === 1 ? "" : "s"}`}
              </p>
              {resposta.total > resposta.resultados.length && (
                <span className="text-xs text-muted-foreground">
                  limite aplicado — ajuste o pedido pra ver mais
                </span>
              )}
            </div>

            {resposta.resultados.length > 0 && (
              <div className="overflow-hidden rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">Cliente</th>
                      <th className="px-3 py-2 text-right font-medium">Saldo CC</th>
                      <th className="px-3 py-2 text-right font-medium">PL</th>
                      <th className="px-3 py-2 text-right font-medium">Atualizado em</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {resposta.resultados.map((c) => (
                      <tr key={c.id} className="hover:bg-muted/30">
                        <td className="px-3 py-2 font-medium">
                          {nomeDeRelacionamento(c)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {fmtBRL.format(c.saldoConta)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {fmtBRL.format(c.saldo)}
                        </td>
                        <td className="px-3 py-2 text-right text-muted-foreground tabular-nums">
                          {fmtDataHora.format(new Date(c.updatedAt))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
