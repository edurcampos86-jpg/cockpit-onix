export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import PrintTrigger from "./print-trigger";
import { ComoFunciona } from "@/components/layout/como-funciona";
import {
  ThumbsUp,
  AlertTriangle,
  MessageCircleQuestion,
  Megaphone,
  Target,
  Quote,
  Sparkles,
  Thermometer,
  RotateCcw,
} from "lucide-react";

// Renderiza o texto da secao realcando blocos "Evidencia:" como quote cards
function RichSection({ texto }: { texto: string }) {
  if (!texto) return null;
  const linhas = texto.split("\n");
  const blocks: Array<{ kind: "text" | "evidence"; content: string }> = [];
  let buffer: string[] = [];
  const flush = () => {
    if (buffer.length > 0) {
      blocks.push({ kind: "text", content: buffer.join("\n") });
      buffer = [];
    }
  };
  for (const l of linhas) {
    if (/^\s*evid[eê]ncia\s*:/i.test(l)) {
      flush();
      blocks.push({ kind: "evidence", content: l.replace(/^\s*evid[eê]ncia\s*:\s*/i, "") });
    } else {
      buffer.push(l);
    }
  }
  flush();
  return (
    <>
      {blocks.map((b, i) =>
        b.kind === "evidence" ? (
          <div
            key={i}
            style={{
              display: "flex",
              gap: 6,
              background: "rgba(255,255,255,0.7)",
              border: "1px solid rgba(0,0,0,0.08)",
              borderLeft: "3px solid rgba(0,0,0,0.35)",
              borderRadius: 4,
              padding: "6px 9px",
              margin: "6px 0",
              fontSize: 9.5,
              fontStyle: "italic",
              color: "#3A2E20",
              lineHeight: 1.55,
            }}
          >
            <Quote size={11} style={{ flexShrink: 0, marginTop: 2, opacity: 0.55 }} />
            <span style={{ whiteSpace: "pre-wrap" }}>{b.content}</span>
          </div>
        ) : (
          <div key={i} style={{ whiteSpace: "pre-wrap" }}>{b.content}</div>
        ),
      )}
    </>
  );
}

// ── PAT estatico por vendedor ────────────────────────────────────────────────
const PAT_PERFIS: Record<string, {
  patCodigo: string; patNome: string; palavras: string[];
  essencia: string; cor: string; corBg: string; inicial: string;
}> = {
  "Eduardo Campos": {
    patCodigo: "76", patNome: "Promocional de Acao Livre",
    palavras: ["Sociavel", "Comunicativo", "Rapido", "Orientado para acao", "Flexivel", "Inovador"],
    essencia: "Eduardo tem uma habilidade natural de criar conexao com as pessoas, comunicar-se de forma fluente e entusiasmante e fazer o cliente sentir que esta sendo ouvido. Seu estilo e envolvente, informal e persuasivo.",
    cor: "#D97706", corBg: "#FEF3C7", inicial: "EC",
  },
  "Thiago Vergal": {
    patCodigo: "22", patNome: "Projetista Criativo",
    palavras: ["Independente", "Analitico", "Ousado", "Empreendedor", "Criativo", "Impaciente"],
    essencia: "Thiago age com autonomia e confianca, resolve problemas complexos com logica e velocidade e nao recua diante de desafios. Sua abordagem e tecnica, direta e orientada a resultados.",
    cor: "#1D4ED8", corBg: "#DBEAFE", inicial: "TV",
  },
  "Rose Oliveira": {
    patCodigo: "118", patNome: "Intro-Diligente Livre",
    palavras: ["Paciente", "Atenciosa", "Bom ouvinte", "Discreta", "Estavel", "Flexivel"],
    essencia: "Rose constroi relacoes com profundidade e cuidado genuino. Sua escuta ativa e paciencia criam um espaco de confianca que muitos clientes raramente encontram.",
    cor: "#7C3AED", corBg: "#EDE9FE", inicial: "RO",
  },
};

// ── Cores das secoes ─────────────────────────────────────────────────────────
const SECAO_CORES = {
  secao1: { cor: "#2E7D32", bgCor: "#F1F8F1", label: "Abordagens Positivas da Semana" },
  secao2: { cor: "#B67800", bgCor: "#FFFBEB", label: "Oportunidades de Melhoria" },
  secao3: { cor: "#1565C0", bgCor: "#EFF6FF", label: "Objecoes Encontradas" },
  secao4: { cor: "#6A1B9A", bgCor: "#F5F3FF", label: "Voz do Cliente" },
  secao5: { cor: "#D4610A", bgCor: "#FFF4ED", label: "Plano de Acao" },
};

// ── Termometro: parse ────────────────────────────────────────────────────────
function parseTermometro(raw: string | null): Array<{ dim: string; nivel: string }> {
  if (!raw) return [];
  return raw.split("\n").filter(Boolean).map(line => {
    const [dim, nivel] = line.split(":").map(s => s.trim());
    const n = nivel?.toLowerCase() || "vermelho";
    return {
      dim: dim || "",
      nivel: n.includes("verde") || n.includes("forte") ? "verde"
           : n.includes("amar") || n.includes("aten") ? "amarelo"
           : "vermelho",
    };
  });
}

// ── Retomada: parse ──────────────────────────────────────────────────────────
function parseRetomada(raw: string | null): Array<{ titulo: string; status: string; evidencia: string }> {
  if (!raw) return [];
  return raw.split("\n").filter(Boolean).map(line => {
    const cleaned = line.replace(/^\d+\.\s*/, "");
    const [titulo, resto] = cleaned.split("|").map(s => s.trim());
    const [status, ...evidParts] = (resto || "Nao verificado").split("—").map(s => s.trim());
    return { titulo: titulo || "", status: status || "", evidencia: evidParts.join(" — ") };
  });
}

// ── Script da Semana: parse ──────────────────────────────────────────────────
function parseScript(raw: string | null): { situacao: string; script: string; porque: string } | null {
  if (!raw) return null;
  const lines = raw.split("\n");
  let situacao = "", script = "", porque = "";
  for (const line of lines) {
    const l = line.trim();
    if (/^situa[çc][aã]o:/i.test(l))   situacao = l.split(":").slice(1).join(":").trim();
    else if (/^script:/i.test(l))       script   = l.split(":").slice(1).join(":").trim();
    else if (/^por que/i.test(l))       porque   = l.split(":").slice(1).join(":").trim();
  }
  return situacao || script ? { situacao, script, porque } : null;
}

// ── Metadata ─────────────────────────────────────────────────────────────────
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rel = await prisma.relatorio.findUnique({ where: { id }, select: { vendedor: true, periodo: true } });
  return { title: rel ? `Relatorio ${rel.vendedor} — ${rel.periodo}` : "Relatorio" };
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default async function PrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const relatorio = await prisma.relatorio.findUnique({
    where: { id },
    include: { acoes: { orderBy: { numero: "asc" } }, metricas: true },
  });

  if (!relatorio) notFound();

  const pat = PAT_PERFIS[relatorio.vendedor] ?? PAT_PERFIS["Eduardo Campos"];
  const termometroData = parseTermometro((relatorio as Record<string, unknown>).termometro as string | null ?? null);
  const retomadaData   = parseRetomada((relatorio as Record<string, unknown>).retomada as string | null ?? null);
  const scriptData     = parseScript((relatorio as Record<string, unknown>).scriptSemana as string | null ?? null);
  const secao0         = (relatorio as Record<string, unknown>).secao0 as string | null ?? null;

  const GOLD   = "#C9A84C";
  const GOLD_D = "#9B6F00";
  const CREAM  = "#FAF9F5";
  const DARK   = "#141413";

  // Shared styles
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
  const sectionHeaderStyle = (bg: string, color: string): React.CSSProperties => ({
    background: bg, padding: "7px 14px", fontSize: 10, fontWeight: 700,
    color, textTransform: "uppercase", letterSpacing: 0.5,
    display: "flex", alignItems: "center", gap: 8,
  });
  const sectionBodyStyle = (bg: string, borderColor: string): React.CSSProperties => ({
    background: bg, padding: "12px 14px", fontSize: 10.5, lineHeight: 1.7,
    color: "#2A2015", whiteSpace: "pre-wrap", borderBottom: `2px solid ${borderColor}`,
  });
  const dividerStyle: React.CSSProperties = { height: 1, background: "#EDE8DE", margin: "20px 0" };

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

      <div className="no-print" style={{ padding: "16px 24px", background: "#f8fafc" }}>
        <ComoFunciona
          proposito="Versão pra impressão / PDF do relatório individual. Layout limpo em A4 com seções (positivo, melhoria, objeções, voz do cliente, plano de ação) e evidências em destaque."
          comoUsar="A impressão abre sozinha. Cancele se quiser revisar primeiro. Pra gerar PDF: escolha ‘Salvar como PDF’ no diálogo de impressão. Use no 1:1 ou pra arquivar."
          comoAjuda="O vendedor leva pra casa — ou guarda em pasta — o relatório que vai discutir na reunião. Mantém a evidência das conversas reais como referência."
        />
      </div>

      {/* ══════════════ PAGINA 1: CAPA + LENTE DO PERFIL ══════════════ */}
      <div style={pageStyle}>
        {/* Faixa dourada do topo */}
        <div style={{ background: GOLD, padding: "24px 48px 20px" }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: "#3A2E00", letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>
            Onix Corretora
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, color: DARK }}>RELATORIO SEMANAL</div>
          <div style={{ fontSize: 12, color: "#3A2E00", marginTop: 2 }}>Desenvolvimento Comercial</div>
        </div>
        <div style={{ height: 3, background: GOLD_D }} />

        <div style={{ padding: "28px 48px 0", flex: 1 }}>
          {/* Avatar + identificacao */}
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16 }}>
            <div style={{
              width: 52, height: 52, borderRadius: "50%",
              background: pat.corBg, color: pat.cor,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 17, fontWeight: 700, flexShrink: 0,
              border: `2px solid ${pat.cor}`,
            }}>
              {pat.inicial}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: DARK }}>{relatorio.vendedor}</div>
              <div style={{ fontSize: 11, color: "#6B6459", marginTop: 1 }}>
                PAT {pat.patCodigo} — {pat.patNome}
              </div>
              <div style={{ fontSize: 10, color: "#6B6459" }}>Periodo: {relatorio.periodo}</div>
            </div>
          </div>

          {/* Palavras-chave */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 16 }}>
            {pat.palavras.map(p => (
              <span key={p} style={{
                padding: "2px 9px", borderRadius: 20,
                background: pat.corBg, color: pat.cor,
                fontSize: 9, fontWeight: 500,
                border: `1px solid ${pat.cor}30`,
              }}>{p}</span>
            ))}
          </div>

          {/* Metricas */}
          {relatorio.metricas && (
            <div style={sectionBoxStyle}>
              <div style={sectionHeaderStyle(GOLD, "#2A1E00")}>Esta Semana em Numeros</div>
              <div style={{ background: "#fff", borderBottom: `2px solid ${GOLD_D}`, display: "grid", gridTemplateColumns: "repeat(4, 1fr)" }}>
                {[
                  { label: "Conversas analisadas", value: relatorio.conversasAnalisadas, color: GOLD_D },
                  { label: "Sem resposta",          value: relatorio.metricas.conversasSemResposta, color: "#B67800" },
                  { label: "Reunioes agendadas",    value: relatorio.metricas.reunioesAgendadas,    color: "#2E7D32" },
                  { label: "Leads perdidos",        value: relatorio.metricas.leadsPerdidos,         color: "#C0392B" },
                ].map((m, i) => (
                  <div key={i} style={{
                    padding: "12px 10px", textAlign: "center",
                    borderRight: i < 3 ? "1px solid #EDE8DE" : "none",
                  }}>
                    <div style={{ fontSize: 22, fontWeight: 700, color: m.color }}>{m.value}</div>
                    <div style={{ fontSize: 8, color: "#6B6459", textTransform: "uppercase", letterSpacing: 0.3, marginTop: 2 }}>{m.label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Essencia do Perfil */}
          <div style={sectionBoxStyle}>
            <div style={sectionHeaderStyle(GOLD, "#2A1E00")}>
              <Sparkles size={13} />
              Essencia do Perfil
            </div>
            <div style={{ background: "#FEF9EC", padding: "10px 14px", fontSize: 10, color: "#2A2015", lineHeight: 1.6, borderBottom: `2px solid ${GOLD_D}`, fontStyle: "italic" }}>
              {pat.essencia}
            </div>
          </div>

          <div style={dividerStyle} />

          {/* Lente do Perfil — Esta Semana (secao0) */}
          {secao0 && (
            <div style={sectionBoxStyle}>
              <div style={sectionHeaderStyle(GOLD, "#2A1E00")}>
                <Sparkles size={13} />
                Lente do Perfil — Esta Semana
              </div>
              <div style={{ ...sectionBodyStyle("#FEF9EC", GOLD_D), fontSize: 10.5 }}>
                {secao0}
              </div>
            </div>
          )}
        </div>

        <div style={pageFooterStyle}>
          <span>Onix Corretora — Documento Confidencial</span>
          <span>Gerado em {new Date(relatorio.dataExecucao).toLocaleDateString("pt-BR")}</span>
        </div>
      </div>

      {/* ══════════════ PAGINA 2: ABORDAGENS + OPORTUNIDADES ══════════════ */}
      <div style={pageStyle}>
        <div style={pageHeaderStyle}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#2A1E00" }}>ONIX CORRETORA</span>
          <span style={{ fontSize: 9, color: "#3A2E00" }}>{relatorio.vendedor} — {relatorio.periodo}</span>
        </div>

        <div style={{ padding: "28px 48px", flex: 1 }}>
          {/* Secao 1 — Abordagens Positivas */}
          <div style={sectionBoxStyle}>
            <div style={sectionHeaderStyle(SECAO_CORES.secao1.cor, "#fff")}>
              <ThumbsUp size={13} />
              1. {SECAO_CORES.secao1.label}
            </div>
            <div style={sectionBodyStyle(SECAO_CORES.secao1.bgCor, SECAO_CORES.secao1.cor)}>
              <RichSection texto={(relatorio as Record<string, unknown>).secao1 as string} />
            </div>
          </div>

          <div style={dividerStyle} />

          {/* Secao 2 — Oportunidades de Melhoria */}
          <div style={sectionBoxStyle}>
            <div style={sectionHeaderStyle(SECAO_CORES.secao2.cor, "#fff")}>
              <AlertTriangle size={13} />
              2. {SECAO_CORES.secao2.label}
            </div>
            <div style={sectionBodyStyle(SECAO_CORES.secao2.bgCor, SECAO_CORES.secao2.cor)}>
              <RichSection texto={(relatorio as Record<string, unknown>).secao2 as string} />
            </div>
          </div>
        </div>

        <div style={pageFooterStyle}>
          <span>Onix Corretora — Documento Confidencial</span>
          <span>Pagina 2</span>
        </div>
      </div>

      {/* ══════════════ PAGINA 3: OBJECOES + SCRIPT + VOZ + TERMOMETRO ══════════════ */}
      <div style={pageStyle}>
        <div style={pageHeaderStyle}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#2A1E00" }}>ONIX CORRETORA</span>
          <span style={{ fontSize: 9, color: "#3A2E00" }}>{relatorio.vendedor} — {relatorio.periodo}</span>
        </div>

        <div style={{ padding: "28px 48px", flex: 1 }}>
          {/* Secao 3 — Objecoes */}
          <div style={sectionBoxStyle}>
            <div style={sectionHeaderStyle(SECAO_CORES.secao3.cor, "#fff")}>
              <MessageCircleQuestion size={13} />
              3. {SECAO_CORES.secao3.label}
            </div>
            <div style={{ ...sectionBodyStyle(SECAO_CORES.secao3.bgCor, SECAO_CORES.secao3.cor), fontSize: 10 }}>
              <RichSection texto={(relatorio as Record<string, unknown>).secao3 as string} />
            </div>
          </div>

          {/* Script da Semana */}
          {scriptData && (
            <div style={sectionBoxStyle}>
              <div style={sectionHeaderStyle(GOLD, "#2A1E00")}>
                <Quote size={13} />
                Script da Semana
              </div>
              <div style={{ background: "#FEF9EC", padding: "10px 14px", borderBottom: `2px solid ${GOLD_D}` }}>
                {scriptData.situacao && (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 8, fontWeight: 600, color: "#9E9084", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 }}>Situacao</div>
                    <div style={{ fontSize: 10, color: "#2A2015" }}>{scriptData.situacao}</div>
                  </div>
                )}
                {scriptData.script && (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 8, fontWeight: 600, color: "#9E9084", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 }}>Script</div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: GOLD_D, paddingLeft: 8, borderLeft: `3px solid ${GOLD}`, lineHeight: 1.5 }}>
                      &ldquo;{scriptData.script}&rdquo;
                    </div>
                  </div>
                )}
                {scriptData.porque && (
                  <div>
                    <div style={{ fontSize: 8, fontWeight: 600, color: "#9E9084", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 }}>Por que funciona</div>
                    <div style={{ fontSize: 10, color: "#2A2015" }}>{scriptData.porque}</div>
                  </div>
                )}
              </div>
            </div>
          )}

          <div style={dividerStyle} />

          {/* Secao 4 — Voz do Cliente */}
          <div style={sectionBoxStyle}>
            <div style={sectionHeaderStyle(SECAO_CORES.secao4.cor, "#fff")}>
              <Megaphone size={13} />
              4. {SECAO_CORES.secao4.label}
            </div>
            <div style={{ ...sectionBodyStyle(SECAO_CORES.secao4.bgCor, SECAO_CORES.secao4.cor), fontSize: 10 }}>
              <RichSection texto={(relatorio as Record<string, unknown>).secao4 as string} />
            </div>
          </div>

          {/* Termometro de Desempenho */}
          {termometroData.length > 0 && (
            <div style={sectionBoxStyle}>
              <div style={sectionHeaderStyle(GOLD, "#2A1E00")}>
                <Thermometer size={13} />
                Termometro de Desempenho
              </div>
              <div style={{ borderBottom: `2px solid ${GOLD_D}` }}>
                {termometroData.map(({ dim, nivel }, i) => {
                  const cfg = nivel === "verde"
                    ? { bg: "#F0FDF4", cor: "#166534", label: "Forte" }
                    : nivel === "amarelo"
                    ? { bg: "#FFFBEB", cor: "#854D0E", label: "Atencao" }
                    : { bg: "#FFF1F2", cor: "#9F1239", label: "Prioridade" };
                  return (
                    <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: cfg.bg, padding: "8px 14px", borderBottom: "1px solid #EDE8DE" }}>
                      <span style={{ fontSize: 10, color: "#2A2015" }}>{dim}</span>
                      <span style={{ fontSize: 9, fontWeight: 700, color: cfg.cor, background: "#fff", padding: "2px 10px", borderRadius: 12, border: `1px solid ${cfg.cor}30` }}>
                        {cfg.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div style={pageFooterStyle}>
          <span>Onix Corretora — Documento Confidencial</span>
          <span>Pagina 3</span>
        </div>
      </div>

      {/* ══════════════ PAGINA 4: RETOMADA + PLANO DE ACAO ══════════════ */}
      <div style={{ ...pageStyle, pageBreakAfter: "auto" }}>
        <div style={pageHeaderStyle}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#2A1E00" }}>ONIX CORRETORA</span>
          <span style={{ fontSize: 9, color: "#3A2E00" }}>{relatorio.vendedor} — {relatorio.periodo}</span>
        </div>

        <div style={{ padding: "28px 48px", flex: 1 }}>
          {/* Retomada da semana anterior */}
          {retomadaData.length > 0 && (
            <div style={sectionBoxStyle}>
              <div style={sectionHeaderStyle("#6B6459", "#fff")}>
                <RotateCcw size={13} />
                Retomada da Semana Anterior
              </div>
              <div style={{ borderBottom: `2px solid ${GOLD_D}` }}>
                {retomadaData.map(({ titulo, status, evidencia }, i) => {
                  const s = status.toLowerCase();
                  const cor = s.includes("aplic") || s.includes("feito") ? "#166534"
                            : s.includes("parcial") ? "#854D0E" : "#9F1239";
                  const label = s.includes("aplic") || s.includes("feito") ? "OK"
                              : s.includes("parcial") ? "~" : "X";
                  return (
                    <div key={i} style={{ display: "flex", gap: 10, padding: "8px 14px", borderBottom: "1px solid #EDE8DE", background: i % 2 === 0 ? "#F5F0E8" : "#FAF9F5", alignItems: "flex-start" }}>
                      <span style={{ fontWeight: 700, color: cor, fontSize: 11, minWidth: 18, textAlign: "center" }}>{label}</span>
                      <div>
                        <div style={{ fontSize: 10.5, fontWeight: 600, color: "#141413" }}>{titulo}</div>
                        {evidencia && <div style={{ fontSize: 9.5, color: "#6B6459", marginTop: 2 }}>{status} — {evidencia}</div>}
                        {!evidencia && <div style={{ fontSize: 9.5, color: "#6B6459", marginTop: 2 }}>{status}</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div style={dividerStyle} />

          {/* Secao 5 — Plano de Acao */}
          <div style={sectionBoxStyle}>
            <div style={sectionHeaderStyle(SECAO_CORES.secao5.cor, "#fff")}>
              <Target size={13} />
              5. {SECAO_CORES.secao5.label}
            </div>
            <div style={sectionBodyStyle(SECAO_CORES.secao5.bgCor, SECAO_CORES.secao5.cor)}>
              {(relatorio as Record<string, unknown>).secao5 as string}
            </div>
          </div>

          {/* Sobre este relatorio */}
          <div style={{ borderLeft: `3px solid ${pat.cor}`, padding: "10px 10px 10px 14px", background: "#F5F0E8", borderRadius: "0 6px 6px 0", marginTop: 20 }}>
            <div style={{ fontSize: 9, fontWeight: 600, color: "#9E9084", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Sobre este relatorio</div>
            <div style={{ fontSize: 9.5, color: "#6B6459", lineHeight: 1.5 }}>
              Este relatorio e um espelho do seu trabalho nesta semana. Cada secao foi escrita com base exclusivamente nas suas conversas reais. A linguagem foi adaptada ao seu perfil PAT para que voce se reconheca em cada linha.
            </div>
          </div>
        </div>

        <div style={pageFooterStyle}>
          <span>Onix Corretora — Documento Confidencial</span>
          <span>Pagina 4</span>
        </div>
      </div>
    </>
  );
}
