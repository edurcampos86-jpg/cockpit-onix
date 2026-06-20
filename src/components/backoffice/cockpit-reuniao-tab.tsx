"use client";

import type { ComponentType } from "react";
import {
  Presentation,
  Users,
  HeartHandshake,
  Briefcase,
  CalendarClock,
  ListChecks,
  Scale,
  Target,
  MessagesSquare,
  Compass,
  Phone,
  Video,
  Mail,
  MessageCircle,
  CalendarDays,
  ClipboardCheck,
} from "lucide-react";
import { getNomeRelacionamento } from "@/lib/backoffice/display-name";

/**
 * Cockpit de Reunião — Fase 1 / PR 1 (display read-only, atrás da flag
 * COCKPIT_REUNIAO). Esta PR entrega o SHELL com todos os blocos do wireframe,
 * mas com DADOS REAIS apenas na "Linha de Interações" (régua). Os demais blocos
 * são placeholders estruturados ("em breve"), preenchidos nas próximas PRs.
 *
 * Read-only puro: nenhuma escrita, nenhum botão que grave.
 */

interface InteracaoRegua {
  id: string;
  tipo: string;
  assunto: string;
  resumo: string | null;
  data: string;
  rcaNotas: string | null;
}

interface ClienteHeader {
  nome: string;
  nomeCompleto: string | null;
  apelido: string | null;
  classificacao: string;
}

// ── Metadados por tipo de interação (ícone + rótulo) ──
const TIPO_META: Record<string, { label: string; Icon: ComponentType<{ className?: string }> }> = {
  ligacao: { label: "Ligação", Icon: Phone },
  reuniao: { label: "Reunião", Icon: Video },
  revisao: { label: "Revisão", Icon: ClipboardCheck },
  email: { label: "E-mail", Icon: Mail },
  whatsapp: { label: "WhatsApp", Icon: MessageCircle },
  evento: { label: "Evento", Icon: CalendarDays },
};

function tipoMeta(tipo: string) {
  return TIPO_META[tipo] ?? { label: tipo, Icon: MessagesSquare };
}

const fmtData = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });

// ── Wrappers de bloco (mantêm o ritmo visual do wireframe) ──

function Bloco({
  titulo,
  Icon,
  subtitulo,
  children,
}: {
  titulo: string;
  Icon: ComponentType<{ className?: string }>;
  subtitulo?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border bg-card p-6">
      <div className="flex items-center gap-2 mb-4">
        <Icon className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">{titulo}</h3>
        {subtitulo && <span className="text-xs text-muted-foreground">· {subtitulo}</span>}
      </div>
      {children}
    </section>
  );
}

/** Placeholder estruturado — vazio elegante até a PR que preenche o bloco. */
function EmBreve({ texto }: { texto: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border/70 bg-muted/20 px-4 py-6 text-center">
      <p className="text-xs text-muted-foreground">{texto}</p>
      <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground/70">
        em breve
      </p>
    </div>
  );
}

export function CockpitReuniaoTab({
  cliente,
  interacoes,
}: {
  cliente: ClienteHeader;
  interacoes: InteracaoRegua[];
}) {
  const nome = getNomeRelacionamento(cliente);
  // Régua: ordem por data desc (defensivo — a query já vem desc).
  const regua = [...interacoes].sort(
    (a, b) => new Date(b.data).getTime() - new Date(a.data).getTime(),
  );

  return (
    <div className="space-y-4">
      {/* ── HEADER DO CLIENTE ── */}
      <section className="rounded-xl border bg-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Presentation className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">{nome}</h2>
              <p className="text-xs text-muted-foreground">Cockpit de Reunião · visão read-only</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-md bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
              Classe {cliente.classificacao}
            </span>
            <span className="inline-flex items-center rounded-md border border-dashed border-border px-2.5 py-1 text-xs text-muted-foreground">
              Próxima reunião · em breve
            </span>
            <span className="inline-flex items-center rounded-md border border-dashed border-border px-2.5 py-1 text-xs text-muted-foreground">
              Perfil · em breve
            </span>
          </div>
        </div>
      </section>

      {/* ── CAMADA ESTÁVEL ── */}
      <div className="grid gap-4 md:grid-cols-3">
        <Bloco titulo="Origem & rede" Icon={Users}>
          <EmBreve texto="Como chegou, indicações e rede de relacionamento." />
        </Bloco>
        <Bloco titulo="Pessoal & familiar" Icon={HeartHandshake}>
          <EmBreve texto="Contexto pessoal e familiar (de Eventos de vida / Descoberta)." />
        </Bloco>
        <Bloco titulo="Profissional" Icon={Briefcase}>
          <EmBreve texto="Atividade profissional e fonte de renda." />
        </Bloco>
      </div>

      {/* ── LINHA DO TEMPO DE REUNIÕES ── */}
      <Bloco titulo="Linha do tempo de reuniões" Icon={CalendarClock} subtitulo="3 primeiras vs 3 últimas">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">3 primeiras</p>
            <EmBreve texto="Reuniões estruturadas mais antigas." />
          </div>
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">3 últimas</p>
            <EmBreve texto="Reuniões estruturadas mais recentes." />
          </div>
        </div>
      </Bloco>

      {/* ── TOP PAUTAS ── */}
      <Bloco titulo="Top pautas" Icon={ListChecks}>
        <EmBreve texto="Pautas recorrentes das reuniões estruturadas." />
      </Bloco>

      {/* ── PENDÊNCIAS POR LADO ── */}
      <Bloco titulo="Pendências por lado" Icon={Scale}>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">Assessor</p>
            <EmBreve texto="Pendências do lado do assessor." />
          </div>
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">Cliente</p>
            <EmBreve texto="Pendências do lado do cliente." />
          </div>
        </div>
      </Bloco>

      {/* ── PROJETOS ── */}
      <Bloco titulo="Projetos" Icon={Target} subtitulo="curto · médio · longo prazo">
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">Curto prazo</p>
            <EmBreve texto="Projetos de curto prazo (de Metas de vida)." />
          </div>
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">Médio prazo</p>
            <EmBreve texto="Projetos de médio prazo." />
          </div>
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">Longo prazo</p>
            <EmBreve texto="Projetos de longo prazo." />
          </div>
        </div>
      </Bloco>

      {/* ── DIÁLOGOS ENTRE REUNIÕES (A RÉGUA — DADOS REAIS) ── */}
      <Bloco
        titulo="Diálogos entre reuniões"
        Icon={MessagesSquare}
        subtitulo={`régua de interações · ${regua.length}`}
      >
        {regua.length === 0 ? (
          <EmBreve texto="Nenhuma interação registrada para este cliente ainda." />
        ) : (
          <ol className="relative space-y-3 pl-5">
            {/* trilho vertical */}
            <span
              aria-hidden
              className="absolute left-[7px] top-1.5 bottom-1.5 w-px bg-border"
            />
            {regua.map((i) => {
              const { label, Icon } = tipoMeta(i.tipo);
              const corpo = i.resumo?.trim() || i.rcaNotas?.trim() || null;
              return (
                <li key={i.id} className="relative">
                  <span className="absolute -left-5 top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full border-2 border-primary bg-background" />
                  <div className="rounded-lg border bg-background p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground">
                        <Icon className="h-3.5 w-3.5 text-primary" />
                        {i.assunto || label}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {fmtData(i.data)} · {label}
                      </span>
                    </div>
                    {corpo && (
                      <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-xs text-muted-foreground">
                        {corpo}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </Bloco>

      {/* ── COMO CONDUZIR (PAT DO CLIENTE) ── */}
      <Bloco titulo="Como conduzir" Icon={Compass} subtitulo="PAT do cliente">
        <EmBreve texto="Arquétipo e diretrizes de condução (PAT do cliente)." />
      </Bloco>
    </div>
  );
}
