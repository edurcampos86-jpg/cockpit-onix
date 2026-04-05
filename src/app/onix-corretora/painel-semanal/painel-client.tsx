"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, AlertTriangle, TrendingUp, Activity } from "lucide-react";
import {
  type Status,
  type ResultadoData,
  type ProcessoData,
  type ComportamentoData,
  formatBRL,
} from "@/lib/painel-utils";

const STATUS_EMOJI: Record<Status, string> = {
  green: "\u{1F7E2}",
  yellow: "\u{1F7E1}",
  red: "\u{1F534}",
};

const STATUS_BAR_COLOR: Record<Status, string> = {
  green: "bg-green-500",
  yellow: "bg-yellow-500",
  red: "bg-red-500",
};

const STATUS_TEXT_COLOR: Record<Status, string> = {
  green: "text-green-500",
  yellow: "text-yellow-500",
  red: "text-red-500",
};

function ProgressBar({ percentual, status }: { percentual: number; status: Status }) {
  return (
    <div className="h-3 rounded-full bg-muted overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-700 ${STATUS_BAR_COLOR[status]}`}
        style={{ width: `${Math.min(percentual, 100)}%` }}
      />
    </div>
  );
}

function ExpandButton({
  expanded,
  onClick,
}: {
  expanded: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 text-xs text-primary hover:underline transition-colors"
    >
      {expanded ? "Recolher" : "Ver detalhes"}
      {expanded ? (
        <ChevronUp className="h-3 w-3" />
      ) : (
        <ChevronDown className="h-3 w-3" />
      )}
    </button>
  );
}

function DaysBadge({ dias }: { dias: number }) {
  const color =
    dias > 5
      ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
      : dias > 2
        ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300"
        : "bg-muted text-muted-foreground";

  return (
    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${color}`}>
      {dias}d
    </span>
  );
}

interface PainelClientProps {
  resultado: ResultadoData;
  processo: ProcessoData;
  comportamento: ComportamentoData;
  periodoLabel: string;
}

export function PainelClient({
  resultado,
  processo,
  comportamento,
  periodoLabel,
}: PainelClientProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    resultado: false,
    processo: false,
    comportamento: false,
  });

  const toggle = (key: string) =>
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <div className="w-full max-w-lg mx-auto flex flex-col gap-3">
      {/* Header */}
      <div className="text-center mb-1">
        <h2 className="text-lg font-bold">Painel Semanal</h2>
        <p className="text-xs text-muted-foreground">{periodoLabel}</p>
      </div>

      {/* CAMADA 1 — RESULTADO */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            <span className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
              Resultado
            </span>
          </div>
          <span className="text-base" title={resultado.status}>
            {STATUS_EMOJI[resultado.status]}
          </span>
        </div>

        {resultado.metaFaturamento ? (
          <>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold">
                {formatBRL(resultado.faturamentoAtual)}
              </span>
              <span className="text-sm text-muted-foreground">
                / {formatBRL(resultado.metaFaturamento)}
              </span>
            </div>
            <ProgressBar
              percentual={Math.round(
                (resultado.faturamentoAtual / resultado.metaFaturamento) * 100,
              )}
              status={resultado.status}
            />
            <div className="flex items-center justify-between">
              <span
                className={`text-xs font-medium ${STATUS_TEXT_COLOR[resultado.status]}`}
              >
                {resultado.percentual}% da meta proporcional
              </span>
              <ExpandButton
                expanded={expanded.resultado}
                onClick={() => toggle("resultado")}
              />
            </div>

            {expanded.resultado && (
              <div className="pt-2 border-t border-border space-y-1">
                <p className="text-xs text-muted-foreground">
                  Meta total do mes:{" "}
                  <span className="font-medium text-foreground">
                    {formatBRL(resultado.metaFaturamento)}
                  </span>
                </p>
                <p className="text-xs text-muted-foreground">
                  Faturamento acumulado:{" "}
                  <span className="font-medium text-foreground">
                    {formatBRL(resultado.faturamentoAtual)}
                  </span>
                </p>
                <p className="text-xs text-muted-foreground">
                  Progresso absoluto:{" "}
                  <span className="font-medium text-foreground">
                    {Math.round(
                      (resultado.faturamentoAtual / resultado.metaFaturamento) *
                        100,
                    )}
                    %
                  </span>
                </p>
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Nenhuma meta definida para este mes.
          </p>
        )}
      </div>

      {/* CAMADA 2 — PROCESSO */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            <span className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
              Processo
            </span>
          </div>
          <span className="text-base" title={processo.status}>
            {STATUS_EMOJI[processo.status]}
          </span>
        </div>

        {processo.totalNegocios > 0 ? (
          <>
            <div className="flex items-baseline gap-3">
              <span className="text-2xl font-bold">
                {processo.totalNegocios}
              </span>
              <span className="text-xs text-muted-foreground">
                negocios ativos
              </span>
            </div>

            <div className="flex gap-3">
              <div className="flex-1 rounded-lg bg-muted/50 p-2.5">
                <p className="text-[10px] text-muted-foreground">
                  Com atividade (7d)
                </p>
                <p className="text-lg font-bold text-green-500">
                  {processo.percentualAtivos}%
                </p>
              </div>
              <div className="flex-1 rounded-lg bg-muted/50 p-2.5">
                <p className="text-[10px] text-muted-foreground">
                  Parados &gt;48h
                </p>
                <p
                  className={`text-lg font-bold ${processo.negociosParados.length > 0 ? "text-red-500" : "text-green-500"}`}
                >
                  {processo.negociosParados.length}
                </p>
              </div>
            </div>

            <div className="flex justify-end">
              <ExpandButton
                expanded={expanded.processo}
                onClick={() => toggle("processo")}
              />
            </div>

            {expanded.processo && processo.negociosParados.length > 0 && (
              <div className="pt-2 border-t border-border space-y-2">
                <p className="text-xs font-medium text-muted-foreground">
                  Negocios parados:
                </p>
                {processo.negociosParados.map((deal) => (
                  <div
                    key={deal.id}
                    className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {deal.nomeCliente}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {deal.responsavel} · {deal.etapa}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <span className="text-xs font-medium">
                        {formatBRL(deal.valor)}
                      </span>
                      <DaysBadge dias={deal.diasSemAtividade} />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {expanded.processo && processo.negociosParados.length === 0 && (
              <div className="pt-2 border-t border-border">
                <p className="text-xs text-green-500">
                  Todos os negocios com atividade recente.
                </p>
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Nenhum negocio cadastrado no pipeline.
          </p>
        )}
      </div>

      {/* CAMADA 3 — COMPORTAMENTO */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-primary" />
            <span className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
              Comportamento
            </span>
          </div>
          <span className="text-base" title={comportamento.status}>
            {STATUS_EMOJI[comportamento.status]}
          </span>
        </div>

        {comportamento.taxaRespostaPorVendedor.length > 0 ? (
          <>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold">
                {comportamento.taxaRespostaMedia}%
              </span>
              <span className="text-xs text-muted-foreground">
                resposta em &lt;24h
              </span>
            </div>

            <ProgressBar
              percentual={comportamento.taxaRespostaMedia}
              status={comportamento.status}
            />

            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                Score medio: {comportamento.scoreMedio}
              </span>
              <ExpandButton
                expanded={expanded.comportamento}
                onClick={() => toggle("comportamento")}
              />
            </div>

            {expanded.comportamento && (
              <div className="pt-2 border-t border-border space-y-2">
                <p className="text-xs font-medium text-muted-foreground">
                  Taxa de resposta por vendedor:
                </p>
                {comportamento.taxaRespostaPorVendedor.map((v) => (
                  <div
                    key={v.vendedor}
                    className="flex items-center justify-between"
                  >
                    <span className="text-sm">{v.vendedor}</span>
                    <span
                      className={`text-sm font-medium ${
                        v.taxa >= 80
                          ? "text-green-500"
                          : v.taxa >= 60
                            ? "text-yellow-500"
                            : "text-red-500"
                      }`}
                    >
                      {v.taxa}%
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Sem dados de comportamento para esta semana.
          </p>
        )}
      </div>
    </div>
  );
}
