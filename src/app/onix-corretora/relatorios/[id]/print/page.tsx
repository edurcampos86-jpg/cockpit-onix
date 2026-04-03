export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import PrintTrigger from "./print-trigger";

// ── PAT estático por vendedor ─────────────────────────────────────────────────
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

// ── Cores das seções ──────────────────────────────────────────────────────────
const SECAO_CFG = [
  { chave: "secao1" as const, num: 1, label: "Abordagens Positivas da Semana",  cor: "#2E7D32", bgCor: "#F1F8F1" },
  { chave: "secao2" as const, num: 2, label: "Oportunidades de Melhoria",       cor: "#B67800", bgCor: "#FFFBEB" },
  { chave: "secao3" as const, num: 3, label: "Objecoes Encontradas",             cor: "#1565C0", bgCor: "#EFF6FF" },
  { chave: "secao4" as const, num: 4, label: "Voz do Cliente",                  cor: "#6A1B9A", bgCor: "#F5F3FF" },
  { chave: "secao5" as const, num: 5, label: "Plano de Acao",                   cor: "#D4610A", bgCor: "#FFF4ED" },
];

// ── Termômetro: parse ─────────────────────────────────────────────────────────
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

// ── Retomada: parse ───────────────────────────────────────────────────────────
function parseRetomada(raw: string | null): Array<{ titulo: string; status: string; evidencia: string }> {
  if (!raw) return [];
  return raw.split("\n").filter(Boolean).map(line => {
    const cleaned = line.replace(/^\d+\.\s*/, "");
    const [titulo, resto] = cleaned.split("|").map(s => s.trim());
    const [status, ...evidParts] = (resto || "Não verificado").split("—").map(s => s.trim());
    return { titulo: titulo || "", status: status || "", evidencia: evidParts.join(" — ") };
  });
}

// ── Script da Semana: parse ───────────────────────────────────────────────────
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

// ── Metadata ──────────────────────────────────────────────────────────────────
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rel = await prisma.relatorio.findUnique({ where: { id }, select: { vendedor: true, periodo: true } });
  return { title: rel ? `Relatorio ${rel.vendedor} — ${rel.periodo}` : "Relatorio" };
}

// ── Page ──────────────────────────────────────────────────────────────────────
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

      {/* ── CAPA ── */}
      <div style={{ background: CREAM, minHeight: "100vh", pageBreakAfter: "always" }}>
        {/* Faixa dourada do topo */}
        <div style={{ background: GOLD, padding: "32px 48px 28px" }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#3A2E00", letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>
            Onix Corretora
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: DARK }}>RELATORIO SEMANAL</div>
          <div style={{ fontSize: 13, color: "#3A2E00", marginTop: 2 }}>Desenvolvimento Comercial</div>
        </div>
        <div style={{ height: 3, background: GOLD_D }} />

        {/* Conteúdo da capa */}
        <div style={{ padding: "40px 48px" }}>
          {/* Avatar + identificação */}
          <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 28 }}>
            <div style={{
              width: 64, height: 64, borderRadius: "50%",
              background: pat.corBg, color: pat.cor,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 20, fontWeight: 700, flexShrink: 0,
              border: `2px solid ${pat.cor}`,
            }}>
              {pat.inicial}
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 700, color: DARK }}>{relatorio.vendedor}</div>
              <div style={{ fontSize: 13, color: "#6B6459", marginTop: 2 }}>
                PAT {pat.patCodigo} — {pat.patNome}
              </div>
              <div style={{ fontSize: 12, color: "#6B6459" }}>Período: {relatorio.periodo}</div>
            </div>
            {relatorio.metricas?.score != null && relatorio.metricas.score > 0 && (
              <div style={{ marginLeft: "auto", textAlign: "center" }}>
                <div style={{
                  fontSize: 32, fontWeight: 700,
                  color: relatorio.metricas.score >= 80 ? "#166534" : relatorio.metricas.score >= 60 ? "#854d0e" : "#991b1b",
                }}>
                  {relatorio.metricas.score}
                </div>
                <div style={{ fontSize: 10, color: "#6B6459" }}>score</div>
              </div>
            )}
          </div>

          {/* Palavras-chave */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 24 }}>
            {pat.palavras.map(p => (
              <span key={p} style={{
                padding: "3px 10px", borderRadius: 20,
                background: pat.corBg, color: pat.cor,
                fontSize: 10, fontWeight: 500,
                border: `1px solid ${pat.cor}30`,
              }}>{p}</span>
            ))}
          </div>

          {/* Essência */}
          <div style={{ borderRadius: 8, overflow: "hidden", marginBottom: 24 }}>
            <div style={{ background: GOLD, padding: "8px 14px", fontSize: 10, fontWeight: 700, color: "#2A1E00", textTransform: "uppercase", letterSpacing: 0.5 }}>
              Essência do Perfil
            </div>
            <div style={{ background: "#FEF9EC", padding: "12px 14px", fontSize: 11, color: "#2A2015", lineHeight: 1.7, borderBottom: `2px solid ${GOLD_D}`, fontStyle: "italic" }}>
              {pat.essencia}
            </div>
          </div>

          {/* Métricas */}
          {relatorio.metricas && (
            <div style={{ borderRadius: 8, overflow: "hidden", marginBottom: 24 }}>
              <div style={{ background: GOLD, padding: "8px 14px", fontSize: 10, fontWeight: 700, color: "#2A1E00", textTransform: "uppercase", letterSpacing: 0.5 }}>
                Esta Semana em Números
              </div>
              <div style={{ background: "#fff", borderBottom: `2px solid ${GOLD_D}`, display: "grid", gridTemplateColumns: "repeat(4, 1fr)" }}>
                {[
                  { label: "Conversas analisadas", value: relatorio.conversasAnalisadas, color: GOLD_D },
                  { label: "Sem resposta",          value: relatorio.metricas.conversasSemResposta, color: "#B67800" },
                  { label: "Reunioes agendadas",    value: relatorio.metricas.reunioesAgendadas,    color: "#2E7D32" },
                  { label: "Leads perdidos",        value: relatorio.metricas.leadsPerdidos,         color: "#C0392B" },
                ].map((m, i) => (
                  <div key={i} style={{
                    padding: "16px 12px", textAlign: "center",
                    borderRight: i < 3 ? "1px solid #EDE8DE" : "none",
                  }}>
                    <div style={{ fontSize: 26, fontWeight: 700, color: m.color }}>{m.value}</div>
                    <div style={{ fontSize: 9, color: "#6B6459", textTransform: "uppercase", letterSpacing: 0.3, marginTop: 3 }}>{m.label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Propósito */}
          <div style={{ borderLeft: `3px solid ${pat.cor}`, paddingLeft: 12, background: "#F5F0E8", padding: "10px 10px 10px 14px", borderRadius: "0 6px 6px 0" }}>
            <div style={{ fontSize: 9, fontWeight: 600, color: "#9E9084", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Por que este relatório existe?</div>
            <div style={{ fontSize: 10, color: "#6B6459", lineHeight: 1.6 }}>
              Este relatório é um espelho do seu trabalho nesta semana. Cada seção foi escrita com base exclusivamente nas suas conversas reais. A linguagem foi adaptada ao seu perfil PAT para que você se reconheça em cada linha.
            </div>
          </div>
        </div>

        {/* Rodapé da capa */}
        <div style={{ borderTop: `1px solid #EDE8DE`, padding: "12px 48px", display: "flex", justifyContent: "space-between", fontSize: 9, color: "#9E9084" }}>
          <span>Onix Corretora — Documento Confidencial</span>
          <span>Gerado em {new Date(relatorio.dataExecucao).toLocaleDateString("pt-BR")}</span>
        </div>
      </div>

      {/* ── CONTEÚDO ── */}
      <div style={{ background: CREAM, padding: "0 0 40px" }}>
        {/* Header de página */}
        <div style={{ background: GOLD, padding: "10px 48px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `2px solid ${GOLD_D}` }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#2A1E00" }}>ONIX CORRETORA</span>
          <span style={{ fontSize: 9, color: "#3A2E00" }}>Relatorio Semanal de Desenvolvimento Comercial</span>
        </div>

        <div style={{ padding: "32px 48px 0" }}>

          {/* Seção 0 — Lente do Perfil */}
          {secao0 && (
            <div style={{ borderRadius: 8, overflow: "hidden", marginBottom: 28 }}>
              <div style={{ background: GOLD, padding: "8px 14px", fontSize: 10, fontWeight: 700, color: "#2A1E00", textTransform: "uppercase", letterSpacing: 0.5 }}>
                0. Lente do Perfil
              </div>
              <div style={{ background: "#FEF9EC", padding: "14px 16px", fontSize: 11, lineHeight: 1.8, color: "#2A2015", borderBottom: `2px solid ${GOLD_D}`, whiteSpace: "pre-wrap" }}>
                {secao0}
              </div>
            </div>
          )}

          {/* Seções 1–4 */}
          {SECAO_CFG.filter(s => s.num < 5).map(({ chave, num, label, cor, bgCor }) => {
            const texto = (relatorio as Record<string, unknown>)[chave] as string;
            return (
              <div key={chave} style={{ borderRadius: 8, overflow: "hidden", marginBottom: 28 }}>
                <div style={{ background: cor, padding: "8px 14px", fontSize: 10, fontWeight: 700, color: "#fff", textTransform: "uppercase", letterSpacing: 0.5 }}>
                  {num}. {label}
                </div>
                <div style={{ background: bgCor, padding: "14px 16px", fontSize: 11, lineHeight: 1.8, color: "#2A2015", borderBottom: `2px solid ${cor}`, whiteSpace: "pre-wrap" }}>
                  {texto}
                </div>
              </div>
            );
          })}

          {/* Script da Semana */}
          {scriptData && (
            <div style={{ borderRadius: 8, overflow: "hidden", marginBottom: 28 }}>
              <div style={{ background: GOLD, padding: "8px 14px", fontSize: 10, fontWeight: 700, color: "#2A1E00", textTransform: "uppercase", letterSpacing: 0.5 }}>
                Script da Semana
              </div>
              <div style={{ background: "#FEF9EC", padding: "14px 16px", borderBottom: `2px solid ${GOLD_D}` }}>
                {scriptData.situacao && (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 9, fontWeight: 600, color: "#9E9084", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3 }}>Situação</div>
                    <div style={{ fontSize: 11, color: "#2A2015" }}>{scriptData.situacao}</div>
                  </div>
                )}
                {scriptData.script && (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 9, fontWeight: 600, color: "#9E9084", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3 }}>Script</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: GOLD_D, paddingLeft: 8, borderLeft: `3px solid ${GOLD}`, lineHeight: 1.6 }}>
                      &ldquo;{scriptData.script}&rdquo;
                    </div>
                  </div>
                )}
                {scriptData.porque && (
                  <div>
                    <div style={{ fontSize: 9, fontWeight: 600, color: "#9E9084", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3 }}>Por que funciona para o seu perfil</div>
                    <div style={{ fontSize: 11, color: "#2A2015" }}>{scriptData.porque}</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Termômetro */}
          {termometroData.length > 0 && (
            <div style={{ borderRadius: 8, overflow: "hidden", marginBottom: 28 }}>
              <div style={{ background: GOLD, padding: "8px 14px", fontSize: 10, fontWeight: 700, color: "#2A1E00", textTransform: "uppercase", letterSpacing: 0.5 }}>
                Termômetro de Desempenho
              </div>
              <div style={{ borderBottom: `2px solid ${GOLD_D}` }}>
                {termometroData.map(({ dim, nivel }, i) => {
                  const cfg = nivel === "verde"
                    ? { bg: "#F0FDF4", cor: "#166534", label: "Forte" }
                    : nivel === "amarelo"
                    ? { bg: "#FFFBEB", cor: "#854D0E", label: "Atenção" }
                    : { bg: "#FFF1F2", cor: "#9F1239", label: "Prioridade" };
                  return (
                    <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: cfg.bg, padding: "10px 16px", borderBottom: "1px solid #EDE8DE" }}>
                      <span style={{ fontSize: 11, color: "#2A2015" }}>{dim}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: cfg.cor, background: "#fff", padding: "2px 10px", borderRadius: 12, border: `1px solid ${cfg.cor}30` }}>
                        {cfg.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Retomada da semana anterior */}
          {retomadaData.length > 0 && (
            <div style={{ borderRadius: 8, overflow: "hidden", marginBottom: 28 }}>
              <div style={{ background: "#6B6459", padding: "8px 14px", fontSize: 10, fontWeight: 700, color: "#fff", textTransform: "uppercase", letterSpacing: 0.5 }}>
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
                    <div key={i} style={{ display: "flex", gap: 12, padding: "10px 16px", borderBottom: "1px solid #EDE8DE", background: i % 2 === 0 ? "#F5F0E8" : "#FAF9F5", alignItems: "flex-start" }}>
                      <span style={{ fontWeight: 700, color: cor, fontSize: 11, minWidth: 20, textAlign: "center" }}>{label}</span>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: "#141413" }}>{titulo}</div>
                        {evidencia && <div style={{ fontSize: 10, color: "#6B6459", marginTop: 2 }}>{status} — {evidencia}</div>}
                        {!evidencia && <div style={{ fontSize: 10, color: "#6B6459", marginTop: 2 }}>{status}</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Seção 5 — Plano de Ação */}
          {(() => {
            const { chave, num, label, cor, bgCor } = SECAO_CFG[4];
            const texto = (relatorio as Record<string, unknown>)[chave] as string;
            return (
              <div style={{ borderRadius: 8, overflow: "hidden", marginBottom: 28 }}>
                <div style={{ background: cor, padding: "8px 14px", fontSize: 10, fontWeight: 700, color: "#fff", textTransform: "uppercase", letterSpacing: 0.5 }}>
                  {num}. {label}
                </div>
                <div style={{ background: bgCor, padding: "14px 16px", fontSize: 11, lineHeight: 1.8, color: "#2A2015", borderBottom: `2px solid ${cor}`, whiteSpace: "pre-wrap" }}>
                  {texto}
                </div>
              </div>
            );
          })()}

          {/* Checklist de Ações */}
          {relatorio.acoes.length > 0 && (
            <div style={{ borderRadius: 8, overflow: "hidden", marginBottom: 28 }}>
              <div style={{ background: "#D4610A", padding: "8px 14px", fontSize: 10, fontWeight: 700, color: "#fff", textTransform: "uppercase", letterSpacing: 0.5 }}>
                Checklist do Plano de Ação — {relatorio.acoes.filter(a => a.concluida).length}/{relatorio.acoes.length} concluídas
              </div>
              <div style={{ background: "#fff", borderBottom: "2px solid #D4610A" }}>
                {relatorio.acoes.map((acao) => (
                  <div key={acao.id} style={{ display: "flex", gap: 12, padding: "10px 16px", borderBottom: "1px solid #F5F0E8", alignItems: "flex-start" }}>
                    <div style={{
                      width: 22, height: 22, borderRadius: "50%",
                      background: acao.concluida ? "#2E7D32" : "#D4610A",
                      color: "#fff", fontSize: 9, fontWeight: 700,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      flexShrink: 0, marginTop: 1,
                    }}>
                      {acao.concluida ? "✓" : acao.numero}
                    </div>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: acao.concluida ? "#6B6459" : "#141413", textDecoration: acao.concluida ? "line-through" : "none" }}>
                        {acao.titulo}
                      </div>
                      {acao.descricao && <div style={{ fontSize: 10, color: "#6B6459", marginTop: 2 }}>{acao.descricao}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Rodapé */}
          <div style={{ borderTop: `1px solid #EDE8DE`, paddingTop: 16, textAlign: "center", fontSize: 9, color: "#9E9084" }}>
            <div>{relatorio.vendedor} · {relatorio.periodo} · Onix Corretora</div>
            <div style={{ marginTop: 4 }}>Documento confidencial — uso exclusivo do colaborador indicado</div>
            <div style={{ marginTop: 2 }}>
              <a href={`/onix-corretora/relatorios/${relatorio.id}`} style={{ color: "#9E9084", fontSize: 8 }}>
                {`cockpit-onix.app/onix-corretora/relatorios/${relatorio.id}`}
              </a>
            </div>
          </div>

        </div>
      </div>
    </>
  );
}
