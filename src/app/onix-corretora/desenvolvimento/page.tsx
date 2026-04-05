export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/layout/page-header";
import Link from "next/link";
import { ArrowRight, Target, TrendingUp } from "lucide-react";
import { PAT_PROFILES } from "@/lib/pat-profiles";
import {
  TRILHAS,
  getFaseAtual,
  getProgressoGeral,
  getProximoMarco,
  mesParaLabel,
} from "@/lib/trilha-data";

export const metadata = {
  title: "Trilha de Desenvolvimento — Onix Corretora",
};

export default async function DesenvolvimentoPage() {
  // Buscar score mais recente de cada vendedor
  const metricas = await prisma.metrica.findMany({
    where: { vendedor: { in: Object.keys(TRILHAS) } },
    orderBy: { createdAt: "desc" },
    distinct: ["vendedor"],
    select: { vendedor: true, score: true, createdAt: true },
  });

  const scoreMap = new Map(metricas.map((m) => [m.vendedor, m.score]));

  const vendedores = Object.entries(TRILHAS).map(([nome, trilha]) => {
    const pat = PAT_PROFILES[nome];
    const faseAtual = getFaseAtual(trilha);
    const progresso = getProgressoGeral(trilha);
    const proximo = getProximoMarco(trilha);
    const scoreAtual = scoreMap.get(nome) ?? 0;
    const scoreMeta = faseAtual?.kpisMeta.score ?? 0;

    return {
      nome,
      pat,
      trilha,
      faseAtual,
      progresso,
      proximo,
      scoreAtual,
      scoreMeta,
    };
  });

  return (
    <div className="min-h-screen">
      <PageHeader
        title="Trilha de Desenvolvimento"
        description="Acompanhamento individual do plano de carreira de cada assessor"
      />

      <div className="p-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-5xl">
          {vendedores.map((v) => (
            <Link
              key={v.nome}
              href={`/onix-corretora/desenvolvimento/${encodeURIComponent(v.nome)}`}
              className="group rounded-xl border border-border bg-card p-6 hover:border-primary/30 hover:shadow-md transition-all"
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div
                    className="w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold"
                    style={{
                      backgroundColor: v.pat?.corBg || "#f3f4f6",
                      color: v.pat?.corPrimaria || "#6b7280",
                    }}
                  >
                    {v.pat?.emoji || v.nome.charAt(0)}
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">{v.nome}</h3>
                    <p className="text-xs text-muted-foreground">
                      {v.trilha.cargoAtual} → {v.trilha.cargoAlvo}
                    </p>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>

              {/* PAT badge */}
              {v.pat && (
                <div
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold mb-4"
                  style={{ backgroundColor: v.pat.corBg, color: v.pat.corPrimaria }}
                >
                  PAT {v.pat.pat} — {v.pat.titulo}
                </div>
              )}

              {/* Fase atual */}
              {v.faseAtual && (
                <div className="mb-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Target className="h-3.5 w-3.5 text-primary" />
                    <span className="text-sm font-medium text-foreground">
                      Fase {v.faseAtual.numero}: {v.faseAtual.titulo}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground ml-5">
                    {mesParaLabel(v.faseAtual.mesInicio)} a {mesParaLabel(v.faseAtual.mesFim)}
                  </p>
                </div>
              )}

              {/* Barra de progresso geral */}
              <div className="mb-4">
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>Progresso geral</span>
                  <span>{v.progresso}%</span>
                </div>
                <div className="h-2.5 rounded-full bg-sidebar-accent overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${v.progresso}%` }}
                  />
                </div>
              </div>

              {/* Score vs Meta */}
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Score:</span>
                  <span
                    className={`text-sm font-bold ${
                      v.scoreAtual >= v.scoreMeta ? "text-green-600" : "text-yellow-600"
                    }`}
                  >
                    {v.scoreAtual}
                  </span>
                  <span className="text-xs text-muted-foreground">/ meta {v.scoreMeta}</span>
                </div>
              </div>

              {/* Próximo marco */}
              {v.proximo && (
                <div className="mt-3 px-3 py-2 rounded-lg bg-sidebar-accent/50 text-xs text-muted-foreground">
                  Proximo marco: <span className="font-medium text-foreground">{v.proximo.titulo}</span>{" "}
                  em {v.proximo.mesesRestantes} {v.proximo.mesesRestantes === 1 ? "mes" : "meses"}
                </div>
              )}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
