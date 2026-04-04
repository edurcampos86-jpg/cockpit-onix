"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfQuarter,
  endOfQuarter,
  format,
} from "date-fns";
import { ptBR } from "date-fns/locale/pt-BR";
import { Zap, X, CheckCircle, AlertCircle, Loader2, ExternalLink } from "lucide-react";
import Link from "next/link";

type TipoPeriodo = "semana" | "mes" | "trimestre" | "custom";

const TODOS_VENDEDORES = ["Eduardo Campos", "Thiago Vergal", "Rose Oliveira"];

function getPeriodoDates(tipo: TipoPeriodo, customInicio: string, customFim: string) {
  const hoje = new Date();
  switch (tipo) {
    case "semana":
      return {
        inicio: startOfWeek(hoje, { weekStartsOn: 1 }),
        fim: endOfWeek(hoje, { weekStartsOn: 1 }),
      };
    case "mes":
      return {
        inicio: startOfMonth(hoje),
        fim: endOfMonth(hoje),
      };
    case "trimestre":
      return {
        inicio: startOfQuarter(hoje),
        fim: endOfQuarter(hoje),
      };
    case "custom": {
      const ini = customInicio ? new Date(customInicio + "T00:00:00") : startOfWeek(hoje, { weekStartsOn: 1 });
      const fim = customFim ? new Date(customFim + "T23:59:59") : endOfWeek(hoje, { weekStartsOn: 1 });
      return { inicio: ini, fim };
    }
  }
}

function formatPeriodoDisplay(inicio: Date, fim: Date): string {
  return `${format(inicio, "dd/MM", { locale: ptBR })} a ${format(fim, "dd/MM/yyyy", { locale: ptBR })}`;
}

export function PeriodoSelector() {
  const router = useRouter();
  const [tipo, setTipo] = useState<TipoPeriodo>("semana");
  const [customInicio, setCustomInicio] = useState("");
  const [customFim, setCustomFim] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingVendedor, setLoadingVendedor] = useState<string | null>(null);
  const [loadingIndex, setLoadingIndex] = useState(0);
  const [resultado, setResultado] = useState<Array<{ vendedor: string; id: string; periodo: string }> | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [vendedoresSelecionados, setVendedoresSelecionados] = useState<string[]>(TODOS_VENDEDORES);

  const { inicio, fim } = useMemo(
    () => getPeriodoDates(tipo, customInicio, customFim),
    [tipo, customInicio, customFim]
  );

  const periodoDisplay = formatPeriodoDisplay(inicio, fim);

  const periodoLabel =
    `${format(inicio, "dd/MM/yyyy")} a ${format(fim, "dd/MM/yyyy")}`;

  function toggleVendedor(v: string) {
    setVendedoresSelecionados((prev) =>
      prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]
    );
  }

  function openModal() {
    setResultado(null);
    setErro(null);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setLoadingVendedor(null);
    setLoadingIndex(0);
  }

  async function handleAnalisar() {
    if (vendedoresSelecionados.length === 0) return;

    setLoading(true);
    setErro(null);
    setResultado(null);

    const todosRelatorios: Array<{ vendedor: string; id: string; periodo: string }> = [];
    const todosErros: string[] = [];

    try {
      // Processa 1 vendedor por vez para evitar timeout do Railway (~120s por request)
      for (let i = 0; i < vendedoresSelecionados.length; i++) {
        const vendedor = vendedoresSelecionados[i];
        setLoadingVendedor(vendedor);
        setLoadingIndex(i + 1);

        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 2 * 60 * 1000); // 2 min por vendedor

          const res = await fetch("/api/onix-corretora/analisar", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              vendedores: [vendedor],
              periodoInicio: inicio.toISOString(),
              periodoFim: fim.toISOString(),
              periodo: periodoLabel,
            }),
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          const data = await res.json();

          if (!res.ok) {
            todosErros.push(`${vendedor}: ${data.error ?? "erro desconhecido"}`);
            continue;
          }

          if (data.relatorios?.length > 0) {
            todosRelatorios.push(...data.relatorios);
          }
          if (data.errors?.length > 0) {
            todosErros.push(...data.errors);
          }
        } catch (err: any) {
          if (err.name === "AbortError") {
            todosErros.push(`${vendedor}: timeout (2 min)`);
          } else {
            todosErros.push(`${vendedor}: ${err.message}`);
          }
        }
      }

      if (todosRelatorios.length > 0) {
        setResultado(todosRelatorios);
      } else if (todosErros.length > 0) {
        setErro(`Nenhum relatorio gerado. Erros: ${todosErros.join("; ")}`);
      } else {
        setErro("Nenhum relatorio foi gerado.");
      }
    } catch (err: any) {
      setErro(err.message ?? "Erro ao conectar com o servidor.");
    } finally {
      setLoading(false);
      setLoadingVendedor(null);
    }
  }

  const tipoButtons: { key: TipoPeriodo; label: string }[] = [
    { key: "semana", label: "Esta Semana" },
    { key: "mes", label: "Mes Atual" },
    { key: "trimestre", label: "Trimestre" },
    { key: "custom", label: "Personalizado" },
  ];

  return (
    <>
      <div className="rounded-xl border border-border bg-card px-6 py-5">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex flex-col gap-3 flex-1">
            <div className="flex flex-wrap gap-2">
              {tipoButtons.map((btn) => (
                <button
                  key={btn.key}
                  onClick={() => setTipo(btn.key)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                    tipo === btn.key
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
                  }`}
                >
                  {btn.label}
                </button>
              ))}
            </div>

            {tipo === "custom" && (
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={customInicio}
                  onChange={(e) => setCustomInicio(e.target.value)}
                  className="text-xs px-3 py-1.5 rounded-lg border border-border bg-sidebar-accent text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <span className="text-xs text-muted-foreground">ate</span>
                <input
                  type="date"
                  value={customFim}
                  onChange={(e) => setCustomFim(e.target.value)}
                  className="text-xs px-3 py-1.5 rounded-lg border border-border bg-sidebar-accent text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            )}

            <p className="text-sm text-muted-foreground">{periodoDisplay}</p>
          </div>

          <button
            onClick={openModal}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors shrink-0"
          >
            <Zap className="h-4 w-4" />
            Gerar Nova Analise
          </button>
        </div>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-card rounded-2xl p-6 w-full max-w-md border border-border shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold">Nova Analise</h2>
              {!loading && (
                <button
                  onClick={closeModal}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              )}
            </div>

            {!loading && !resultado && !erro && (
              <>
                <div className="inline-flex items-center px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-medium mb-5">
                  {periodoDisplay}
                </div>

                <div className="mb-5">
                  <p className="text-xs text-muted-foreground mb-3 font-medium uppercase tracking-wide">
                    Selecionar vendedores
                  </p>
                  <div className="space-y-2">
                    {TODOS_VENDEDORES.map((v) => (
                      <label
                        key={v}
                        className="flex items-center gap-3 cursor-pointer group"
                      >
                        <input
                          type="checkbox"
                          checked={vendedoresSelecionados.includes(v)}
                          onChange={() => toggleVendedor(v)}
                          className="w-4 h-4 rounded border-border accent-primary cursor-pointer"
                        />
                        <span className="text-sm text-foreground group-hover:text-primary transition-colors">
                          {v}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="rounded-lg bg-sidebar-accent border border-border p-3 mb-5 space-y-1.5">
                  <p className="text-xs font-medium text-foreground">Fontes de dados:</p>
                  <p className="text-xs text-muted-foreground">Conversas do CRM Datacrazy + gravacoes do Plaud (se configurado)</p>
                  <p className="text-xs text-muted-foreground">Tempo estimado: 2-4 minutos por vendedor.</p>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={closeModal}
                    className="flex-1 px-4 py-2.5 text-sm rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleAnalisar}
                    disabled={vendedoresSelecionados.length === 0}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Zap className="h-4 w-4" />
                    Iniciar
                  </button>
                </div>
              </>
            )}

            {loading && (
              <div className="flex flex-col items-center gap-4 py-6">
                <Loader2 className="h-8 w-8 text-primary animate-spin" />
                <div className="text-center">
                  <p className="text-sm font-medium">
                    Analisando {loadingVendedor}...
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {loadingIndex} de {vendedoresSelecionados.length} vendedor
                    {vendedoresSelecionados.length > 1 ? "es" : ""}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground text-center max-w-xs">
                  Buscando conversas, analisando transcricoes e gerando relatorio. Aguarde.
                </p>
              </div>
            )}

            {resultado && !loading && (
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-green-400/10 flex items-center justify-center shrink-0">
                    <CheckCircle className="h-5 w-5 text-green-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Analise concluida!</p>
                    <p className="text-xs text-muted-foreground">
                      {resultado.length} relatorio{resultado.length !== 1 ? "s" : ""} gerado{resultado.length !== 1 ? "s" : ""}.
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  {resultado.map((r) => (
                    <Link
                      key={r.id}
                      href={`/onix-corretora/relatorios/${r.id}`}
                      className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-sidebar-accent hover:bg-primary/10 transition-colors group"
                    >
                      <div>
                        <p className="text-xs font-medium text-foreground">{r.vendedor}</p>
                        <p className="text-[11px] text-muted-foreground">{r.periodo}</p>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-primary font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                        Ver relatorio
                        <ExternalLink className="h-3 w-3" />
                      </div>
                    </Link>
                  ))}
                </div>

                <button
                  onClick={() => {
                    closeModal();
                    router.refresh();
                  }}
                  className="w-full px-4 py-2.5 text-sm rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
                >
                  Fechar e atualizar
                </button>
              </div>
            )}

            {erro && !loading && (
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-red-400/10 flex items-center justify-center shrink-0">
                    <AlertCircle className="h-5 w-5 text-red-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Erro na analise</p>
                    <p className="text-xs text-muted-foreground mt-0.5 break-words max-w-[280px]">
                      {erro}
                    </p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={closeModal}
                    className="flex-1 px-4 py-2.5 text-sm rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Fechar
                  </button>
                  <button
                    onClick={() => {
                      setErro(null);
                      handleAnalisar();
                    }}
                    className="flex-1 px-4 py-2.5 text-sm rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
                  >
                    Tentar novamente
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
