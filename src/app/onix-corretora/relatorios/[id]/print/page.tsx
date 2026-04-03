export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import PrintTrigger from "./print-trigger";

const SECAO_LABELS: Record<string, { label: string; color: string }> = {
  secao1: { label: "Abordagens Positivas da Semana", color: "#2E7D32" },
  secao2: { label: "Oportunidades de Melhoria", color: "#F9A825" },
  secao3: { label: "Objecoes Encontradas", color: "#1565C0" },
  secao4: { label: "Voz do Cliente", color: "#6A1B9A" },
  secao5: { label: "Plano de Acao", color: "#F47B20" },
};

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rel = await prisma.relatorio.findUnique({ where: { id }, select: { vendedor: true, periodo: true } });
  return { title: rel ? `Relatorio ${rel.vendedor} — ${rel.periodo}` : "Relatorio" };
}

export default async function PrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const relatorio = await prisma.relatorio.findUnique({
    where: { id },
    include: { acoes: { orderBy: { numero: "asc" } }, metricas: true },
  });

  if (!relatorio) notFound();

  const secoes = ["secao1", "secao2", "secao3", "secao4", "secao5"] as const;

  const s: Record<string, React.CSSProperties> = {
    page:    { fontFamily: "'Helvetica Neue', Arial, sans-serif", background: "#fff", color: "#111", maxWidth: 800, margin: "0 auto", padding: "40px 48px" },
    header:  { borderBottom: "3px solid #C9A84C", paddingBottom: 20, marginBottom: 32 },
    logoRow: { display: "flex", alignItems: "center", gap: 12, marginBottom: 12 },
    logoDot: { width: 36, height: 36, borderRadius: 8, background: "#06090F", display: "flex", alignItems: "center", justifyContent: "center", color: "#C9A84C", fontWeight: 900, fontSize: 18, flexShrink: 0 },
    company: { fontSize: 10, color: "#666" },
    vendorName: { fontSize: 24, fontWeight: 700, color: "#06090F", marginBottom: 2 },
    periodo: { fontSize: 12, color: "#555" },
    metaRow: { display: "flex", gap: 32, marginTop: 12, flexWrap: "wrap" as const },
    metaItem: { display: "flex", flexDirection: "column" as const },
    metaLabel: { fontSize: 9, textTransform: "uppercase" as const, letterSpacing: 0.5, color: "#888" },
    metaValue: { fontSize: 14, fontWeight: 700, color: "#06090F" },
    metricasGrid: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 28 },
    metricaCard: { border: "1px solid #e5e7eb", borderRadius: 8, padding: 12, textAlign: "center" as const, background: "#fff" },
    metricaLbl: { fontSize: 9, color: "#888", textTransform: "uppercase" as const, letterSpacing: 0.5, marginTop: 4 },
    secaoHeader: { padding: "8px 14px", borderRadius: "6px 6px 0 0", fontSize: 9, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: 0.5, color: "#fff" },
    secaoBody: { border: "1px solid #e5e7eb", borderTop: "none", borderRadius: "0 0 6px 6px", padding: 16, whiteSpace: "pre-wrap" as const, fontSize: 11, lineHeight: 1.7, color: "#333", background: "#fff", marginBottom: 24 },
    acaoItem: { display: "flex", gap: 10, padding: "8px 0", borderBottom: "1px solid #f0f0f0" },
    acaoNum: { width: 22, height: 22, borderRadius: "50%", background: "#F47B20", color: "#fff", fontSize: 9, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 },
    acaoTitulo: { fontSize: 11, fontWeight: 600, color: "#111" },
    acaoDesc: { fontSize: 10, color: "#555", marginTop: 2 },
    footer: { marginTop: 40, paddingTop: 16, borderTop: "1px solid #e5e7eb", textAlign: "center" as const, fontSize: 9, color: "#999" },
  };

  return (
    <>
      {/* Reset dark theme, ensure white background for print */}
      <style>{`
        html, body { background: #fff !important; color: #111 !important; }
        @media print {
          html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      <PrintTrigger />

      <div style={s.page}>
        {/* Header */}
        <div style={s.header}>
          <div style={s.logoRow}>
            <div style={s.logoDot}>O</div>
            <span style={s.company}>Onix Corretora — Relatorio de Desenvolvimento Comercial</span>
          </div>
          <div style={s.vendorName}>{relatorio.vendedor}</div>
          <div style={s.periodo}>Periodo: {relatorio.periodo}</div>
          <div style={s.metaRow}>
            <div style={s.metaItem}>
              <span style={s.metaLabel}>Conversas analisadas</span>
              <span style={s.metaValue}>{relatorio.conversasAnalisadas}</span>
            </div>
            <div style={s.metaItem}>
              <span style={s.metaLabel}>Data de geracao</span>
              <span style={s.metaValue}>{new Date(relatorio.dataExecucao).toLocaleDateString("pt-BR")}</span>
            </div>
            {relatorio.metricas && relatorio.metricas.score > 0 && (
              <div style={s.metaItem}>
                <span style={s.metaLabel}>Score semanal</span>
                <span style={{
                  display: "inline-block",
                  padding: "3px 10px",
                  borderRadius: 20,
                  fontSize: 11,
                  fontWeight: 700,
                  background: relatorio.metricas.score >= 80 ? "#dcfce7" : relatorio.metricas.score >= 60 ? "#fef9c3" : "#fee2e2",
                  color: relatorio.metricas.score >= 80 ? "#166534" : relatorio.metricas.score >= 60 ? "#854d0e" : "#991b1b",
                }}>
                  Score {relatorio.metricas.score}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Metricas */}
        {relatorio.metricas && (
          <div style={s.metricasGrid}>
            {[
              { label: "Sem resposta", value: relatorio.metricas.conversasSemResposta, color: "#F9A825" },
              { label: "Reunioes agendadas", value: relatorio.metricas.reunioesAgendadas, color: "#2E7D32" },
              { label: "Leads perdidos", value: relatorio.metricas.leadsPerdidos, color: "#c62828" },
              { label: "Acoes concluidas", value: `${relatorio.acoes.filter(a => a.concluida).length}/${relatorio.acoes.length}`, color: "#1565C0" },
            ].map((m) => (
              <div key={m.label} style={s.metricaCard}>
                <div style={{ fontSize: 22, fontWeight: 700, color: m.color }}>{m.value}</div>
                <div style={s.metricaLbl}>{m.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Secoes */}
        {secoes.map((chave) => {
          const { label, color } = SECAO_LABELS[chave];
          const texto = (relatorio as Record<string, unknown>)[chave] as string;
          return (
            <div key={chave}>
              <div style={{ ...s.secaoHeader, background: color }}>{label}</div>
              <div style={s.secaoBody}>{texto}</div>
            </div>
          );
        })}

        {/* Plano de Acao checklist */}
        {relatorio.acoes.length > 0 && (
          <div>
            <div style={{ ...s.secaoHeader, background: "#F47B20", borderRadius: 6, marginBottom: 0 }}>
              Checklist do Plano de Acao
            </div>
            <div style={{ border: "1px solid #e5e7eb", borderTop: "none", borderRadius: "0 0 6px 6px", padding: "12px 16px", background: "#fff", marginBottom: 24 }}>
              {relatorio.acoes.map((acao) => (
                <div key={acao.id} style={s.acaoItem}>
                  <div style={s.acaoNum}>{acao.numero}</div>
                  <div>
                    <div style={{ ...s.acaoTitulo, ...(acao.concluida ? { textDecoration: "line-through", color: "#999" } : {}) }}>
                      {acao.titulo}
                    </div>
                    {acao.descricao && <div style={s.acaoDesc}>{acao.descricao}</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={s.footer}>
          Gerado pelo Cockpit Onix · Confidencial · Uso interno
        </div>
      </div>
    </>
  );
}
