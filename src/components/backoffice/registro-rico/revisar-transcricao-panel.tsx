"use client";

import { useState } from "react";
import { Bot, Check, Loader2, Pencil, Quote, X } from "lucide-react";

/**
 * Painel de revisão das sugestões extraídas de uma transcrição.
 *
 * Uma sugestão, uma decisão. Não há "aceitar todas", e isso é deliberado: o
 * valor da revisão está em ler cada linha uma vez, e é exatamente lendo que se
 * descobre que a máquina ouviu "Jorge" onde o cliente disse "George", ou
 * registrou como meta uma frase dita de brincadeira.
 *
 * O trecho da transcrição fica visível ao lado de cada sugestão. Sem ele, o
 * revisor teria que reler a reunião inteira para conferir uma frase — e o que
 * ele faria em vez disso é aceitar tudo.
 */

export type SugestaoView = {
  id: string;
  destino: string;
  campo: string;
  rotulo: string;
  valorSugerido: string;
  valorEditado: string | null;
  trecho: string | null;
  confianca: number | null;
  status: string;
};

export function RevisarTranscricaoPanel({
  sugestoes: iniciais,
  onDecidida,
}: {
  sugestoes: readonly SugestaoView[];
  onDecidida?: (id: string, status: string) => void;
}) {
  const [sugestoes, setSugestoes] = useState<SugestaoView[]>([...iniciais]);

  const pendentes = sugestoes.filter((s) => s.status === "pendente");
  const decididas = sugestoes.length - pendentes.length;

  function atualizar(id: string, status: string) {
    setSugestoes((atual) => atual.map((s) => (s.id === id ? { ...s, status } : s)));
    onDecidida?.(id, status);
  }

  if (sugestoes.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-center">
        <p className="text-sm text-muted-foreground">
          Nenhuma sugestão nesta transcrição. Reunião operacional costuma não gerar nenhuma — é
          resultado esperado, não erro.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-semibold">
          <Bot className="h-4 w-4" aria-hidden />
          Revisar o que a transcrição sugeriu
        </h3>
        <span className="text-xs text-muted-foreground">
          {pendentes.length} {pendentes.length === 1 ? "pendente" : "pendentes"}
          {decididas > 0 && ` · ${decididas} decidida${decididas === 1 ? "" : "s"}`}
        </span>
      </div>

      <p className="text-xs text-muted-foreground">
        Nada aqui foi gravado na ficha ainda. Cada linha entra só quando você aceitar.
      </p>

      <div className="space-y-2">
        {sugestoes.map((s) => (
          <CartaoSugestao key={s.id} sugestao={s} onDecidida={atualizar} />
        ))}
      </div>
    </div>
  );
}

function CartaoSugestao({
  sugestao,
  onDecidida,
}: {
  sugestao: SugestaoView;
  onDecidida: (id: string, status: string) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(sugestao.valorEditado ?? sugestao.valorSugerido);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const decidida = sugestao.status !== "pendente";

  async function decidir(acao: "aceitar" | "descartar") {
    setEnviando(true);
    setErro(null);
    try {
      const res = await fetch(`/api/backoffice/sugestoes/${sugestao.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          acao,
          // Só manda `valorEditado` se o texto realmente mudou: mandar sempre
          // marcaria toda sugestão como "editada" e o selo diria "você
          // escreveu" sobre uma frase que veio pronta da máquina.
          valorEditado:
            acao === "aceitar" && texto.trim() !== sugestao.valorSugerido.trim()
              ? texto.trim()
              : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErro(json.error ?? "Não foi possível salvar");
        return;
      }
      onDecidida(sugestao.id, acao === "aceitar" ? "aceita" : "descartada");
    } catch {
      setErro("Falha de rede. Tente de novo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div
      className={`rounded-lg border p-3 space-y-2 ${
        decidida ? "border-border bg-muted/30 opacity-70" : "border-border bg-card"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {sugestao.rotulo}
            </span>
            {/* Confiança baixa é o sinal de "isto depende de interpretação".
                Mostrar só quando é baixa: um selo em toda linha vira ruído. */}
            {sugestao.confianca !== null && sugestao.confianca < 0.5 && (
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-400">
                interpretação
              </span>
            )}
          </div>

          {editando && !decidida ? (
            <textarea
              rows={3}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              aria-label={`Editar ${sugestao.rotulo}`}
              className="w-full rounded border border-border bg-background px-2 py-1 text-sm"
            />
          ) : (
            <p className="text-sm">{texto}</p>
          )}

          {sugestao.trecho && (
            <p className="flex gap-1.5 text-xs italic text-muted-foreground">
              <Quote className="h-3 w-3 shrink-0 mt-0.5" aria-hidden />
              {sugestao.trecho}
            </p>
          )}
        </div>

        {decidida ? (
          <span className="shrink-0 text-xs text-muted-foreground">
            {sugestao.status === "aceita" ? "Aceita" : "Descartada"}
          </span>
        ) : (
          <div className="flex shrink-0 gap-1">
            <button
              type="button"
              onClick={() => setEditando((v) => !v)}
              disabled={enviando}
              aria-label="Editar antes de aceitar"
              title="Editar antes de aceitar"
              className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => decidir("aceitar")}
              disabled={enviando || !texto.trim()}
              aria-label="Aceitar e gravar na ficha"
              title="Aceitar e gravar na ficha"
              className="rounded p-1.5 text-emerald-600 hover:bg-emerald-50 disabled:opacity-50 dark:hover:bg-emerald-950"
            >
              {enviando ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
            </button>
            <button
              type="button"
              onClick={() => decidir("descartar")}
              disabled={enviando}
              aria-label="Descartar"
              title="Descartar — a ficha não muda"
              className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {erro && <p className="text-xs text-destructive">{erro}</p>}
    </div>
  );
}
