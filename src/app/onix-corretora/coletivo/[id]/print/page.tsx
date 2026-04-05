export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import PrintTrigger from "./print-trigger";

// ── Vendedores ───────────────────────────────────────────────────────────────
const VENDEDOR_CFG: Record<string, { cor: string; corBg: string; inicial: string; pat: string }> = {
  "Thiago Vergal":  { cor: "#1D4ED8", corBg: "#DBEAFE", inicial: "TV", pat: "PAT 22 — Projetista Criativo" },
  "Rose Oliveira":  { cor: "#7C3AED", corBg: "#EDE9FE", inicial: "RO", pat: "PAT 118 — Intro-Diligente Livre" },
};

// ── Parsers ──────────────────────────────────────────────────────────────────
function parseMetricasConsolidadas(raw: string): Array<{ label: string; value: string; trend: string }> {
  if (!raw) return [];
  const metricas: Array<{ label: string; value: string; trend: string }> = [];
  const lines = raw.split("\n").filter(Boolean);
  const map: Record<string, string> = {};
  for (const line of lines) {
    const [key, val] = line.split(":").map(s => s.trim());
    if (key && val) map[key.toLowerCase()] = val;
  }
  metricas.push({ label: "Conversas analisadas", value: map["conversas_analisadas"] || "0", trend: map["variacao_conversas"] || "" });
  metricas.push({ label: "Sem resposta", value: map["sem_resposta"] || "0", trend: map["variacao_sem_resposta"] || "" });
  metricas.push({ label: "Reunioes agendadas", value: map["reunioes_agendadas"] || "0", trend: map["variacao_reunioes"] || "" });
  metricas.push({ label: "Leads perdidos", value: map["leads_perdidos"] || "0", trend: map["variacao_leads"] || "" });
  return metricas;
}

function parseScoreIndividual(raw: string): Array<{ vendedor: string; score: string; variacao: string }> {
  if (!raw) return [];
  return raw.split("\n").filter(Boolean).map(line => {
    const [nome, resto] = line.split(":").map(s => s.trim());
    const parts = (resto || "").split("|").map(s => s.trim());
    const score = parts[0] || "0";
    const variacao = parts[1]?.replace(/^variacao:\s*/i, "") || "";
    return { vendedor: nome, score, variacao };
  });
}

function parseTermometroTime(raw: string): Array<{ dim: string; proporcao: string; nivel: string }> {
  if (!raw) return [];
  return raw.split("\n").filter(Boolean).map(line => {
    const [dim, resto] = line.split(":").map(s => s.trim());
    const parts = (resto || "").split("|").map(s => s.trim());
    const proporcao = parts[0] || "";
    const nivelRaw = (parts[1] || "").toLowerCase();
    const nivel = nivelRaw.includes("verde") ? "verde" : nivelRaw.includes("amar") ? "amarelo" : "vermelho";
    return { dim: dim || "", proporcao, nivel };
  });
}

function parseObjecoes(raw: string): Array<{ titulo: string; frequencia: string; analise: string }> {
  if (!raw) return [];
  const items: Array<{ titulo: string; frequencia: string; analise: string }> = [];
  const regex = /OBJECAO\s+\d+:\s*(.+?)\nFrequencia:\s*(.+?)\nAnalise:\s*([\s\S]*?)(?=OBJECAO\s+\d+:|$)/gi;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(raw)) !== null) {
    items.push({ titulo: m[1].trim(), frequencia: m[2].trim(), analise: m[3].trim() });
  }
  return items;
}

function parsePadroes(raw: string, prefix: string): Array<{ titulo: string; descricao: string; frequencia?: string }> {
  if (!raw) return [];
  const items: Array<{ titulo: string; descricao: string; frequencia?: string }> = [];
  const regex = new RegExp(`${prefix}\\s+\\d+:\\s*(.+?)\\n([\\s\\S]*?)(?=${prefix}\\s+\\d+:|$)`, "gi");
  let m: RegExpExecArray | null;
  while ((m = regex.exec(raw)) !== null) {
    const titulo = m[1].trim();
    const body = m[2].trim();
    const freqMatch = body.match(/^Frequencia:\s*(.+)/im);
    const descMatch = body.match(/^Descri[cç][aã]o:\s*([\s\S]*)/im);
    items.push({
      titulo,
      descricao: descMatch ? descMatch[1].trim() : body.replace(/^Frequencia:.*\n?/im, "").replace(/^Descri[cç][aã]o:\s*/im, "").trim(),
      frequencia: freqMatch ? freqMatch[1].trim() : undefined,
    });
  }
  return items;
}

function parseScript(raw: string): { objecao: string; script: string; porque: string } | null {
  if (!raw) return null;
  const lines = raw.split("\n");
  let objecao = "", script = "", porque = "";
  for (const line of lines) {
    const l = line.trim();
    if (/^obje[cç][aã]o alvo:/i.test(l)) objecao = l.split(":").slice(1).join(":").trim();
    else if (/^script:/i.test(l)) script = l.split(":").slice(1).join(":").trim();
    else if (/^por que/i.test(l)) porque = l.split(":").slice(1).join(":").trim();
  }
  return objecao || script ? { objecao, script, porque } : null;
}

function parsePlano(raw: string): Array<{ titulo: string; descricao: string }> {
  if (!raw) return [];
  const items: Array<{ titulo: string; descricao: string }> = [];
  const regex = /ACAO\s+(\d+):\s*(.+?)\n([\s\S]*?)(?=ACAO\s+\d+:|$)/gi;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(raw)) !== null) {
    items.push({ titulo: m[2].trim(), descricao: m[3].trim() });
  }
  return items;
}

// ── Metadata ─────────────────────────────────────────────────────────────────
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rel = await prisma.relatorioColetivo.findUnique({ where: { id }, select: { periodo: true } });
  return { title: rel ? `Padroes Coletivos — ${rel.periodo}` : "Padroes Coletivos" };
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default async function PrintColetivoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rel = await prisma.relatorioColetivo.findUnique({ where: { id } });
  if (!rel) notFound();

  const vendedores = rel.vendedoresAnalisados.split(",").map(v => v.trim());
  const metricas = parseMetricasConsolidadas(rel.metricasConsolidadas || "");
  const scores = parseScoreIndividual(rel.scoreIndividual || "");
  const termometro = parseTermometroTime(rel.termometroTime || "");
  const objecoes = parseObjecoes(rel.objecoesRecorrentes || "");
  const positivos = parsePadroes(rel.padroesPositivos || "", "POSITIVO");
  const riscos = parsePadroes(rel.padroesRisco || "", "RISCO");
  const scriptData = parseScript(rel.scriptColetivo || "");
  const plano = parsePlano(rel.planoColetivo || "");
  const cumprimento: Array<{ vendedor: string; total: number; concluidas: number }> =
    rel.cumprimentoAnterior ? JSON.parse(rel.cumprimentoAnterior) : [];

  const GOLD = "#C9A84C";
  const GOLD_D = "#9B6F00";
  const CREAM = "#FAF9F5";
  const DARK = "#141413";

  const metricColors = ["#9B6F00", "#B67800", "#2E7D32", "#C0392B"];

  const pageStyle: React.CSSProperties = {
    background: CREAM, minHeight: "100vh",
    pageBreakAfter: "always",
    display: "flex", flexDirection: "column",
  };
  const pageHeaderStyle: React.CSSProperties = {
    background: GOLD, padding: "10px 48px",
    display: "flex", justifyContent: "space-between", alignItems: "center",
    borderBottom: `2px solid ${GOLD_D}`,
  };
  const pageFooterStyle: React.CSSProperties = {
    marginTop: "auto",
    borderTop: "1px solid #EDE8DE", padding: "12px 48px",
    display: "flex", justifyContent: "space-between",
    fontSize: 9, color: "#9E9084",
  };
  const sectionBoxStyle: React.CSSProperties = { borderRadius: 8, overflow: "hidden", marginBottom: 20 };
  const sectionHeader = (bg: string, color: string): React.CSSProperties => ({
    background: bg, padding: "7px 14px", fontSize: 10, fontWeight: 700,
    color, textTransform: "uppercase", letterSpacing: 0.5,
  });
  const dividerStyle: React.CSSProperties = { height: 1, background: "#EDE8DE", margin: "20px 0" };

  const totalCumprimento = cumprimento.reduce((a, c) => a + c.total, 0);
  const totalConcluidas = cumprimento.reduce((a, c) => a + c.concluidas, 0);
  const pctCumprimento = totalCumprimento > 0 ? Math.round((totalConcluidas / totalCumprimento) * 100) : 0;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { background: #fff !important; color: ${DARK} !important; font-family: 'Poppins', 'Helvetica Neue', sans-serif; }
        @media print {
          html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
          @page { margin: 0; }
        }
      `}</style>
      <PrintTrigger />

      {/* ══════════════ PAGINA 1: CAPA + METRICAS + TERMOMETRO ══════════════ */}
      <div style={pageStyle}>
        <div style={{ background: GOLD, padding: "24px 48px 20px" }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: "#3A2E00", letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>
            Onix Corretora
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, color: DARK }}>PADROES COLETIVOS</div>
          <div style={{ fontSize: 12, color: "#3A2E00", marginTop: 2 }}>Visao Consolidada do Time Comercial</div>
        </div>
        <div style={{ height: 3, background: GOLD_D }} />

        <div style={{ padding: "28px 48px 0", flex: 1 }}>
          {/* Periodo + Avatars */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: DARK }}>{rel.periodo}</div>
              <div style={{ fontSize: 10, color: "#6B6459", marginTop: 2 }}>{vendedores.length} assessores analisados</div>
            </div>
            <div style={{ display: "flex", gap: 12 }}>
              {vendedores.map(v => {
                const cfg = VENDEDOR_CFG[v];
                if (!cfg) return null;
                return (
                  <div key={v} style={{ textAlign: "center" }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: "50%",
                      background: cfg.corBg, color: cfg.cor,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 9, fontWeight: 700, border: `2px solid ${cfg.cor}`,
                    }}>{cfg.inicial}</div>
                    <div style={{ fontSize: 7, color: "#6B6459", marginTop: 3 }}>{v.split(" ")[0]}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Metricas Consolidadas */}
          {metricas.length > 0 && (
            <div style={sectionBoxStyle}>
              <div style={sectionHeader(GOLD, "#2A1E00")}>Metricas Consolidadas do Time</div>
              <div style={{ background: "#fff", borderBottom: `2px solid ${GOLD_D}`, display: "grid", gridTemplateColumns: "repeat(4, 1fr)" }}>
                {metricas.map((m, i) => (
                  <div key={i} style={{ padding: "14px 10px", textAlign: "center", borderRight: i < 3 ? "1px solid #EDE8DE" : "none" }}>
                    <div style={{ fontSize: 24, fontWeight: 700, color: metricColors[i] || GOLD_D }}>{m.value}</div>
                    <div style={{ fontSize: 8, color: "#6B6459", textTransform: "uppercase", letterSpacing: 0.3, marginTop: 3 }}>{m.label}</div>
                    {m.trend && (
                      <div style={{ fontSize: 8, marginTop: 2, color: m.trend.startsWith("-") || m.trend.startsWith("+0") ? "#2E7D32" : m.trend.startsWith("+") && m.label.toLowerCase().includes("perdido") ? "#9F1239" : m.trend.startsWith("+") ? "#2E7D32" : "#6B6459" }}>
                        {m.trend} vs anterior
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Score Individual */}
          {scores.length > 0 && (
            <div style={sectionBoxStyle}>
              <div style={sectionHeader(GOLD, "#2A1E00")}>Score Individual</div>
              <div style={{ borderBottom: `2px solid ${GOLD_D}` }}>
                {scores.map((s, i) => {
                  const cfg = VENDEDOR_CFG[s.vendedor];
                  const scoreNum = parseInt(s.score) || 0;
                  const scoreColor = scoreNum >= 80 ? "#166534" : scoreNum >= 60 ? "#854D0E" : "#9F1239";
                  return (
                    <div key={i} style={{ display: "flex", alignItems: "center", padding: "10px 14px", background: i % 2 === 0 ? "#FEF9EC" : "#fff", borderBottom: "1px solid #EDE8DE", justifyContent: "space-between" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        {cfg && (
                          <div style={{
                            width: 28, height: 28, borderRadius: "50%",
                            background: cfg.corBg, color: cfg.cor,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 9, fontWeight: 700, border: `2px solid ${cfg.cor}`,
                          }}>{cfg.inicial}</div>
                        )}
                        <div>
                          <div style={{ fontSize: 10.5, fontWeight: 600, color: DARK }}>{s.vendedor}</div>
                          {cfg && <div style={{ fontSize: 8, color: "#6B6459" }}>{cfg.pat}</div>}
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ fontSize: 18, fontWeight: 700, color: scoreColor }}>{s.score}</div>
                        {s.variacao && <div style={{ fontSize: 8, color: s.variacao.startsWith("+") ? "#2E7D32" : s.variacao.startsWith("-") ? "#9F1239" : "#6B6459" }}>{s.variacao}</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div style={dividerStyle} />

          {/* Termometro do Time */}
          {termometro.length > 0 && (
            <div style={sectionBoxStyle}>
              <div style={sectionHeader(GOLD, "#2A1E00")}>Termometro do Time</div>
              <div style={{ borderBottom: `2px solid ${GOLD_D}` }}>
                {termometro.map(({ dim, proporcao, nivel }, i) => {
                  const cfg = nivel === "verde"
                    ? { bg: "#F0FDF4", cor: "#166534", label: "Forte" }
                    : nivel === "amarelo"
                    ? { bg: "#FFFBEB", cor: "#854D0E", label: "Atencao" }
                    : { bg: "#FFF1F2", cor: "#9F1239", label: "Prioridade" };
                  return (
                    <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: cfg.bg, padding: "8px 14px", borderBottom: "1px solid #EDE8DE" }}>
                      <span style={{ fontSize: 10, color: "#2A2015" }}>{dim}</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        {proporcao && <span style={{ fontSize: 7, color: "#6B6459" }}>{proporcao}</span>}
                        <span style={{ fontSize: 9, fontWeight: 700, color: cfg.cor, background: "#fff", padding: "2px 10px", borderRadius: 12, border: `1px solid ${cfg.cor}30` }}>
                          {cfg.label}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div style={pageFooterStyle}>
          <span>Onix Corretora — Documento Confidencial</span>
          <span>Gerado em {new Date(rel.dataExecucao).toLocaleDateString("pt-BR")}</span>
        </div>
      </div>

      {/* ══════════════ PAGINA 2: OBJECOES + POSITIVOS + RISCOS ══════════════ */}
      <div style={pageStyle}>
        <div style={pageHeaderStyle}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#2A1E00" }}>ONIX CORRETORA</span>
          <span style={{ fontSize: 9, color: "#3A2E00" }}>Padroes Coletivos — {rel.periodo}</span>
        </div>
        <div style={{ padding: "28px 48px", flex: 1 }}>
          {/* Objecoes Recorrentes */}
          {objecoes.length > 0 && (
            <div style={sectionBoxStyle}>
              <div style={sectionHeader("#1565C0", "#fff")}>Objecoes Recorrentes do Time</div>
              <div style={{ borderBottom: "2px solid #1565C0" }}>
                {objecoes.map((obj, i) => (
                  <div key={i} style={{ padding: "10px 14px", borderBottom: "1px solid #EDE8DE", display: "flex", gap: 10, alignItems: "flex-start", background: i % 2 === 0 ? "#EFF6FF" : "#fff" }}>
                    <div style={{ width: 22, height: 22, borderRadius: "50%", background: "#1565C0", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, flexShrink: 0 }}>{i + 1}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 10.5, fontWeight: 600, color: DARK }}>{obj.titulo}</div>
                      <div style={{ fontSize: 9, color: "#1565C0", fontWeight: 500, marginTop: 2 }}>{obj.frequencia}</div>
                      <div style={{ fontSize: 9.5, color: "#2A2015", marginTop: 4, lineHeight: 1.5 }}>{obj.analise}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={dividerStyle} />

          {/* Padroes Positivos */}
          {positivos.length > 0 && (
            <div style={sectionBoxStyle}>
              <div style={sectionHeader("#2E7D32", "#fff")}>Padroes Positivos — O que Replicar</div>
              <div style={{ borderBottom: "2px solid #2E7D32" }}>
                {positivos.map((p, i) => (
                  <div key={i} style={{ padding: "10px 14px", borderBottom: "1px solid #EDE8DE", display: "flex", gap: 10, alignItems: "flex-start", background: i % 2 === 0 ? "#F1F8F1" : "#fff" }}>
                    <div style={{ width: 22, height: 22, borderRadius: "50%", background: "#2E7D32", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, flexShrink: 0 }}>+</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 10.5, fontWeight: 600, color: DARK }}>{p.titulo}</div>
                      <div style={{ fontSize: 9.5, color: "#2A2015", marginTop: 4, lineHeight: 1.5 }}>{p.descricao}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={dividerStyle} />

          {/* Padroes de Risco */}
          {riscos.length > 0 && (
            <div style={sectionBoxStyle}>
              <div style={sectionHeader("#9F1239", "#fff")}>Padroes de Risco — Alerta Coletivo</div>
              <div style={{ borderBottom: "2px solid #9F1239" }}>
                {riscos.map((r, i) => (
                  <div key={i} style={{ padding: "10px 14px", borderBottom: "1px solid #EDE8DE", display: "flex", gap: 10, alignItems: "flex-start", background: i % 2 === 0 ? "#FFF1F2" : "#fff" }}>
                    <div style={{ width: 22, height: 22, borderRadius: "50%", background: "#9F1239", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, flexShrink: 0 }}>!</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 10.5, fontWeight: 600, color: DARK }}>{r.titulo}</div>
                      {r.frequencia && <div style={{ fontSize: 9, color: "#9F1239", fontWeight: 500, marginTop: 2 }}>{r.frequencia}</div>}
                      <div style={{ fontSize: 9.5, color: "#2A2015", marginTop: 4, lineHeight: 1.5 }}>{r.descricao}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div style={pageFooterStyle}>
          <span>Onix Corretora — Documento Confidencial</span>
          <span>Pagina 2</span>
        </div>
      </div>

      {/* ══════════════ PAGINA 3: SCRIPT + PLANO + CUMPRIMENTO ══════════════ */}
      <div style={{ ...pageStyle, pageBreakAfter: "auto" }}>
        <div style={pageHeaderStyle}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#2A1E00" }}>ONIX CORRETORA</span>
          <span style={{ fontSize: 9, color: "#3A2E00" }}>Padroes Coletivos — {rel.periodo}</span>
        </div>
        <div style={{ padding: "28px 48px", flex: 1 }}>
          {/* Script Coletivo */}
          {scriptData && (
            <div style={sectionBoxStyle}>
              <div style={sectionHeader(GOLD, "#2A1E00")}>Script Coletivo da Semana</div>
              <div style={{ background: "#FEF9EC", padding: "14px", borderBottom: `2px solid ${GOLD_D}` }}>
                {scriptData.objecao && (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 8, fontWeight: 600, color: "#9E9084", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3 }}>Objecao alvo</div>
                    <div style={{ fontSize: 10, color: "#2A2015" }}>{scriptData.objecao}</div>
                  </div>
                )}
                {scriptData.script && (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 8, fontWeight: 600, color: "#9E9084", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3 }}>Script</div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: GOLD_D, paddingLeft: 8, borderLeft: `3px solid ${GOLD}`, lineHeight: 1.5 }}>
                      &ldquo;{scriptData.script}&rdquo;
                    </div>
                  </div>
                )}
                {scriptData.porque && (
                  <div>
                    <div style={{ fontSize: 8, fontWeight: 600, color: "#9E9084", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3 }}>Por que funciona para o time</div>
                    <div style={{ fontSize: 10, color: "#2A2015", lineHeight: 1.6 }}>{scriptData.porque}</div>
                  </div>
                )}
              </div>
            </div>
          )}

          <div style={dividerStyle} />

          {/* Plano Coletivo */}
          {plano.length > 0 && (
            <div style={sectionBoxStyle}>
              <div style={sectionHeader("#D4610A", "#fff")}>Plano Coletivo — Proxima Semana</div>
              <div style={{ background: "#FFF4ED", borderBottom: "2px solid #D4610A" }}>
                {plano.map((a, i) => (
                  <div key={i} style={{ padding: "12px 14px", borderBottom: i < plano.length - 1 ? "1px solid #EDE8DE" : "none" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <div style={{ width: 20, height: 20, borderRadius: "50%", background: "#D4610A", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, flexShrink: 0 }}>{i + 1}</div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: DARK }}>{a.titulo}</div>
                    </div>
                    <div style={{ fontSize: 9.5, color: "#2A2015", lineHeight: 1.6, paddingLeft: 28, whiteSpace: "pre-wrap" }}>{a.descricao}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={dividerStyle} />

          {/* Cumprimento do Plano Anterior */}
          {cumprimento.length > 0 && (
            <div style={sectionBoxStyle}>
              <div style={sectionHeader("#6B6459", "#fff")}>Cumprimento do Plano Anterior</div>
              <div style={{ borderBottom: `2px solid ${GOLD_D}` }}>
                <div style={{ display: "flex", alignItems: "center", padding: "10px 14px", background: "#F5F0E8", borderBottom: "1px solid #EDE8DE", gap: 10 }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#854D0E", minWidth: 36, textAlign: "center" }}>
                    {totalConcluidas}/{totalCumprimento}
                  </div>
                  <div>
                    <div style={{ fontSize: 10.5, fontWeight: 600, color: DARK }}>Acoes concluidas no total do time</div>
                    <div style={{ fontSize: 9, color: "#6B6459", marginTop: 2 }}>
                      {cumprimento.map(c => `${c.vendedor.split(" ")[0]}: ${c.concluidas}/${c.total}`).join(" | ")}
                    </div>
                  </div>
                </div>
                <div style={{ padding: "8px 14px", background: CREAM }}>
                  <div style={{ height: 8, background: "#EDE8DE", borderRadius: 4, overflow: "hidden" }}>
                    <div style={{ width: `${pctCumprimento}%`, height: "100%", background: "linear-gradient(90deg, #2E7D32, #B67800)", borderRadius: 4 }} />
                  </div>
                  <div style={{ fontSize: 8, color: "#6B6459", textAlign: "center", marginTop: 4 }}>{pctCumprimento}% de cumprimento</div>
                </div>
              </div>
            </div>
          )}

          {/* Sobre este relatorio */}
          <div style={{ borderLeft: `3px solid ${GOLD}`, padding: "10px 10px 10px 14px", background: "#F5F0E8", borderRadius: "0 6px 6px 0", marginTop: 20 }}>
            <div style={{ fontSize: 9, fontWeight: 600, color: "#9E9084", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Sobre este relatorio</div>
            <div style={{ fontSize: 9.5, color: "#6B6459", lineHeight: 1.5 }}>
              Este relatorio consolida os padroes identificados nos relatorios individuais de {vendedores.join(" e ")}. Os padroes positivos e de risco sao apresentados sem identificacao individual, para uso na reuniao coletiva de terca-feira. Pontos sensiveis de cada assessor devem ser tratados individualmente.
            </div>
          </div>
        </div>
        <div style={pageFooterStyle}>
          <span>Onix Corretora — Documento Confidencial</span>
          <span>Pagina 3</span>
        </div>
      </div>
    </>
  );
}
