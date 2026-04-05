export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rel = await prisma.relatorioColetivo.findUnique({ where: { id }, select: { periodo: true } });
  return { title: rel ? `Padroes Coletivos — ${rel.periodo}` : "Padroes Coletivos" };
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function SectionBox({ title, color, bgColor, children }: {
  title: string; color: string; bgColor: string; children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg overflow-hidden mb-5">
      <div className="px-4 py-2 text-xs font-bold uppercase tracking-wide" style={{ background: color, color: "#fff" }}>
        {title}
      </div>
      <div className="p-4 text-sm leading-relaxed whitespace-pre-wrap" style={{ background: bgColor, borderBottom: `2px solid ${color}` }}>
        {children}
      </div>
    </div>
  );
}

export default async function ColetivoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rel = await prisma.relatorioColetivo.findUnique({ where: { id } });
  if (!rel) notFound();

  const vendedores = rel.vendedoresAnalisados.split(",").map(v => v.trim());

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/onix-corretora/coletivo" className="p-2 rounded-lg hover:bg-muted transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-foreground">Padroes Coletivos</h1>
            <p className="text-sm text-muted-foreground">{rel.periodo} · {vendedores.length} assessores</p>
          </div>
        </div>
        <Link
          href={`/onix-corretora/coletivo/${rel.id}/print`}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Printer className="h-4 w-4" />
          Imprimir / PDF
        </Link>
      </div>

      {/* Metricas Consolidadas */}
      {rel.metricasConsolidadas && (
        <SectionBox title="Metricas Consolidadas do Time" color="#C9A84C" bgColor="#FEF9EC">
          {rel.metricasConsolidadas}
        </SectionBox>
      )}

      {/* Score Individual */}
      {rel.scoreIndividual && (
        <SectionBox title="Score Individual" color="#C9A84C" bgColor="#FEF9EC">
          {rel.scoreIndividual}
        </SectionBox>
      )}

      {/* Termometro */}
      {rel.termometroTime && (
        <SectionBox title="Termometro do Time" color="#C9A84C" bgColor="#FEF9EC">
          {rel.termometroTime}
        </SectionBox>
      )}

      {/* Objecoes */}
      {rel.objecoesRecorrentes && (
        <SectionBox title="Objecoes Recorrentes do Time" color="#1565C0" bgColor="#EFF6FF">
          {rel.objecoesRecorrentes}
        </SectionBox>
      )}

      {/* Padroes Positivos */}
      {rel.padroesPositivos && (
        <SectionBox title="Padroes Positivos — O que Replicar" color="#2E7D32" bgColor="#F1F8F1">
          {rel.padroesPositivos}
        </SectionBox>
      )}

      {/* Padroes de Risco */}
      {rel.padroesRisco && (
        <SectionBox title="Padroes de Risco — Alerta Coletivo" color="#9F1239" bgColor="#FFF1F2">
          {rel.padroesRisco}
        </SectionBox>
      )}

      {/* Script Coletivo */}
      {rel.scriptColetivo && (
        <SectionBox title="Script Coletivo da Semana" color="#C9A84C" bgColor="#FEF9EC">
          {rel.scriptColetivo}
        </SectionBox>
      )}

      {/* Plano Coletivo */}
      {rel.planoColetivo && (
        <SectionBox title="Plano Coletivo — Proxima Semana" color="#D4610A" bgColor="#FFF4ED">
          {rel.planoColetivo}
        </SectionBox>
      )}
    </div>
  );
}
