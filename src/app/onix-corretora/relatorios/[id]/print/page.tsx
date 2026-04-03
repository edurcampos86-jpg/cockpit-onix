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

  return (
    <html lang="pt-BR">
      <head>
        <meta charSet="utf-8" />
        <title>{`Relatorio ${relatorio.vendedor} — ${relatorio.periodo}`}</title>
        <style>{`
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: 'Helvetica Neue', Arial, sans-serif; background: #fff; color: #111; font-size: 11pt; line-height: 1.5; }
          .page { max-width: 800px; margin: 0 auto; padding: 40px 48px; }
          .header { border-bottom: 3px solid #C9A84C; padding-bottom: 20px; margin-bottom: 32px; }
          .header-logo { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
          .logo-dot { width: 36px; height: 36px; border-radius: 8px; background: #06090F; display: flex; align-items: center; justify-content: center; color: #C9A84C; font-weight: 900; font-size: 18px; }
          .company { font-size: 10pt; color: #666; }
          .vendor-name { font-size: 20pt; font-weight: 700; color: #06090F; margin-bottom: 2px; }
          .periodo { font-size: 11pt; color: #555; }
          .meta-row { display: flex; gap: 32px; margin-top: 12px; }
          .meta-item { display: flex; flex-direction: column; }
          .meta-label { font-size: 8pt; text-transform: uppercase; letter-spacing: 0.5px; color: #888; }
          .meta-value { font-size: 13pt; font-weight: 700; color: #06090F; }
          .score-badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 9pt; font-weight: 700; }
          .secao { margin-bottom: 28px; page-break-inside: avoid; }
          .secao-header { padding: 8px 14px; border-radius: 6px 6px 0 0; font-size: 9pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #fff; }
          .secao-body { border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 6px 6px; padding: 16px; white-space: pre-wrap; font-size: 10pt; line-height: 1.7; color: #333; }
          .acoes-section { margin-top: 8px; page-break-inside: avoid; }
          .acao-item { display: flex; gap: 10px; padding: 8px 0; border-bottom: 1px solid #f0f0f0; }
          .acao-num { width: 22px; height: 22px; border-radius: 50%; background: #F47B20; color: #fff; font-size: 9pt; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 1px; }
          .acao-titulo { font-size: 10pt; font-weight: 600; color: #111; }
          .acao-desc { font-size: 9pt; color: #555; margin-top: 2px; }
          .acao-concluida .acao-titulo { text-decoration: line-through; color: #999; }
          .metricas-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 28px; }
          .metrica-card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; text-align: center; }
          .metrica-num { font-size: 18pt; font-weight: 700; }
          .metrica-lbl { font-size: 8pt; color: #888; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 2px; }
          .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e5e7eb; text-align: center; font-size: 8pt; color: #999; }
          @media print {
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .no-print { display: none; }
            .page { padding: 20px 28px; }
          }
        `}</style>
      </head>
      <body>
        <PrintTrigger />
        <div className="page">
          {/* Header */}
          <div className="header">
            <div className="header-logo">
              <div className="logo-dot">O</div>
              <span className="company">Onix Corretora — Relatorio de Desenvolvimento Comercial</span>
            </div>
            <div className="vendor-name">{relatorio.vendedor}</div>
            <div className="periodo">Periodo: {relatorio.periodo}</div>
            <div className="meta-row">
              <div className="meta-item">
                <span className="meta-label">Conversas analisadas</span>
                <span className="meta-value">{relatorio.conversasAnalisadas}</span>
              </div>
              <div className="meta-item">
                <span className="meta-label">Data de geracao</span>
                <span className="meta-value">{new Date(relatorio.dataExecucao).toLocaleDateString("pt-BR")}</span>
              </div>
              {relatorio.metricas && relatorio.metricas.score > 0 && (
                <div className="meta-item">
                  <span className="meta-label">Score semanal</span>
                  <span
                    className="score-badge"
                    style={{
                      background: relatorio.metricas.score >= 80 ? "#dcfce7" : relatorio.metricas.score >= 60 ? "#fef9c3" : "#fee2e2",
                      color: relatorio.metricas.score >= 80 ? "#166534" : relatorio.metricas.score >= 60 ? "#854d0e" : "#991b1b",
                    }}
                  >
                    Score {relatorio.metricas.score}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Metricas */}
          {relatorio.metricas && (
            <div className="metricas-grid">
              {[
                { label: "Sem resposta", value: relatorio.metricas.conversasSemResposta, color: "#F9A825" },
                { label: "Reunioes agendadas", value: relatorio.metricas.reunioesAgendadas, color: "#2E7D32" },
                { label: "Leads perdidos", value: relatorio.metricas.leadsPerdidos, color: "#c62828" },
                { label: "Acoes concluidas", value: `${relatorio.acoes.filter(a => a.concluida).length}/${relatorio.acoes.length}`, color: "#1565C0" },
              ].map((m) => (
                <div key={m.label} className="metrica-card">
                  <div className="metrica-num" style={{ color: m.color }}>{m.value}</div>
                  <div className="metrica-lbl">{m.label}</div>
                </div>
              ))}
            </div>
          )}

          {/* Secoes */}
          {secoes.map((chave) => {
            const { label, color } = SECAO_LABELS[chave];
            const texto = relatorio[chave];
            return (
              <div key={chave} className="secao">
                <div className="secao-header" style={{ background: color }}>{label}</div>
                <div className="secao-body">{texto}</div>
              </div>
            );
          })}

          {/* Plano de Acao com checklist */}
          {relatorio.acoes.length > 0 && (
            <div className="acoes-section">
              <div className="secao-header" style={{ background: "#F47B20", borderRadius: "6px" }}>
                Checklist do Plano de Acao
              </div>
              <div style={{ border: "1px solid #e5e7eb", borderTop: "none", borderRadius: "0 0 6px 6px", padding: "12px 16px" }}>
                {relatorio.acoes.map((acao) => (
                  <div key={acao.id} className={`acao-item ${acao.concluida ? "acao-concluida" : ""}`}>
                    <div className="acao-num">{acao.numero}</div>
                    <div>
                      <div className="acao-titulo">{acao.titulo}</div>
                      {acao.descricao && <div className="acao-desc">{acao.descricao}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="footer">
            Gerado pelo Cockpit Onix · Confidencial · Uso interno
          </div>
        </div>
      </body>
    </html>
  );
}
