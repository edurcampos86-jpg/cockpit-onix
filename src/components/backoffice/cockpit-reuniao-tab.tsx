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
 * Cockpit de Reunião — Fase 1 (display read-only, atrás da flag COCKPIT_REUNIAO).
 *
 * PR shell (#190): estrutura de todos os blocos + régua de interações real.
 * PR camada de contexto (esta): troca os placeholders dos blocos de CONTEXTO
 * por dados que JÁ existem (reaproveitando o que a page do cliente carrega):
 *   - Projetos          ← MetaCliente (horizonte derivado de prazoData)
 *   - Pessoal/familiar  ← EventoVida + PerfilDescoberta.familiaSituacao + idade/observacoes
 *   - Profissional      ← ClienteBackoffice (profissão/suitability) + One-Page Plan + Descoberta
 *   - Origem & rede     ← sem dado dedicado hoje → placeholder honesto (não inventa)
 *
 * Blocos ainda sem dado (linha do tempo, top pautas, pendências, "como conduzir"/PAT)
 * seguem placeholder até as PRs que os alimentam. Read-only puro: nada grava.
 */

interface InteracaoRegua {
  id: string;
  tipo: string;
  assunto: string;
  resumo: string | null;
  data: string;
  rcaNotas: string | null;
}

interface MetaContexto {
  id: string;
  titulo: string;
  prazoData: string | null;
  valorAlvo: number | null;
  categoria: string | null;
  status: string;
}

interface EventoContexto {
  id: string;
  tipo: string;
  titulo: string;
  data: string;
  recorrente: boolean;
}

interface ClienteContexto {
  nome: string;
  nomeCompleto: string | null;
  apelido: string | null;
  classificacao: string;
  profissao?: string | null;
  nicho?: string | null;
  perfilInvestidor?: string | null;
  tipoInvestidor?: string | null;
  faixaCliente?: string | null;
  idade?: number | null;
  observacoes?: string | null;
}

// ── Formatação ──
const fmtData = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });

const moeda = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);

const limpo = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.trim() : null;

// ── Metadados por tipo de interação (régua) ──
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

const EVENTO_LABEL: Record<string, string> = {
  aniversario: "Aniversário",
  casamento: "Casamento",
  nascimento: "Nascimento",
  formatura: "Formatura",
  outro: "Outro",
};

// ── Horizonte derivado do prazo (categoria do MetaCliente é TEMA, não horizonte) ──
type Horizonte = "curto" | "medio" | "longo" | "indef";
function horizonteDe(prazoData: string | null): Horizonte {
  if (!prazoData) return "indef";
  const ms = new Date(prazoData).getTime();
  if (Number.isNaN(ms)) return "indef";
  const anos = (ms - Date.now()) / (365.25 * 24 * 60 * 60 * 1000);
  if (anos < 1) return "curto";
  if (anos <= 3) return "medio";
  return "longo";
}

// ── Wrappers ──
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
      <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground/70">em breve</p>
    </div>
  );
}

/** Par rótulo/valor read-only. Não renderiza nada se o valor for vazio. */
function Campo({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="whitespace-pre-wrap text-sm text-foreground">{value}</dd>
    </div>
  );
}

function MetaCard({ m }: { m: MetaContexto }) {
  const encerrada = m.status === "atingida" || m.status === "cancelada";
  return (
    <div className="rounded-lg border bg-background p-3">
      <p className={`text-sm font-medium ${encerrada ? "text-muted-foreground line-through" : "text-foreground"}`}>
        {m.titulo}
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>{m.prazoData ? fmtData(m.prazoData) : "sem prazo"}</span>
        {m.valorAlvo != null && <span className="text-primary">{moeda(m.valorAlvo)}</span>}
        {m.categoria && (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wider">
            {m.categoria}
          </span>
        )}
      </div>
    </div>
  );
}

export function CockpitReuniaoTab({
  cliente,
  interacoes,
  metas,
  eventos,
  perfilDescoberta,
  planoUmaPagina,
}: {
  cliente: ClienteContexto;
  interacoes: InteracaoRegua[];
  metas: MetaContexto[];
  eventos: EventoContexto[];
  perfilDescoberta: Record<string, string | null> | null;
  planoUmaPagina: Record<string, string | number | null> | null;
}) {
  const nome = getNomeRelacionamento(cliente);

  // ── Projetos por horizonte ──
  const porHorizonte: Record<Horizonte, MetaContexto[]> = { curto: [], medio: [], longo: [], indef: [] };
  for (const m of metas) porHorizonte[horizonteDe(m.prazoData)].push(m);

  // ── Pessoal & familiar ──
  const familiaSituacao = limpo(perfilDescoberta?.familiaSituacao);
  const obs = limpo(cliente.observacoes);
  const idade = typeof cliente.idade === "number" ? `${cliente.idade} anos` : null;
  const temPessoal = familiaSituacao || obs || idade || eventos.length > 0;

  // ── Profissional ──
  const objetivoPrincipal = limpo(planoUmaPagina?.objetivoPrincipal);
  const experienciaPrev = limpo(perfilDescoberta?.experienciaPrev);
  const camposProf = [
    limpo(cliente.profissao),
    limpo(cliente.nicho),
    limpo(cliente.perfilInvestidor),
    limpo(cliente.tipoInvestidor),
    limpo(cliente.faixaCliente),
    objetivoPrincipal,
    experienciaPrev,
  ];
  const temProf = camposProf.some(Boolean);

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
        {/* Origem & rede — sem dado dedicado hoje → placeholder honesto */}
        <Bloco titulo="Origem & rede" Icon={Users}>
          <EmBreve texto="Sem dado de origem cadastrado. Indicações e rede entram numa próxima PR." />
        </Bloco>

        {/* Pessoal & familiar */}
        <Bloco titulo="Pessoal & familiar" Icon={HeartHandshake}>
          {!temPessoal ? (
            <EmBreve texto="Sem situação familiar, idade ou eventos de vida registrados." />
          ) : (
            <div className="space-y-3">
              {idade && (
                <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  {idade}
                </span>
              )}
              {familiaSituacao && (
                <Campo label="Situação familiar" value={familiaSituacao} />
              )}
              {obs && <Campo label="Observações" value={obs} />}
              {eventos.length > 0 && (
                <div>
                  <p className="mb-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                    Eventos de vida
                  </p>
                  <ul className="space-y-1.5">
                    {eventos.map((e) => (
                      <li key={e.id} className="flex items-center justify-between gap-2 text-sm">
                        <span className="text-foreground">
                          {e.titulo || EVENTO_LABEL[e.tipo] || e.tipo}
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {fmtData(e.data)}
                          {e.recorrente ? " · anual" : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </Bloco>

        {/* Profissional */}
        <Bloco titulo="Profissional" Icon={Briefcase}>
          {!temProf ? (
            <EmBreve texto="Sem profissão ou contexto profissional disponível." />
          ) : (
            <dl className="space-y-3">
              <Campo label="Profissão" value={limpo(cliente.profissao)} />
              <Campo label="Nicho" value={limpo(cliente.nicho)} />
              <Campo label="Perfil (suitability)" value={limpo(cliente.perfilInvestidor)} />
              <Campo label="Tipo de investidor" value={limpo(cliente.tipoInvestidor)} />
              <Campo label="Faixa" value={limpo(cliente.faixaCliente)} />
              <Campo label="Objetivo principal (One-Page Plan)" value={objetivoPrincipal} />
              <Campo label="Experiência com investimentos" value={experienciaPrev} />
            </dl>
          )}
        </Bloco>
      </div>

      {/* ── LINHA DO TEMPO DE REUNIÕES (sem dado ainda) ── */}
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

      {/* ── TOP PAUTAS (sem dado ainda) ── */}
      <Bloco titulo="Top pautas" Icon={ListChecks}>
        <EmBreve texto="Pautas recorrentes das reuniões estruturadas." />
      </Bloco>

      {/* ── PENDÊNCIAS POR LADO (sem dado ainda) ── */}
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

      {/* ── PROJETOS (MetaCliente, por horizonte) ── */}
      <Bloco titulo="Projetos" Icon={Target} subtitulo="curto · médio · longo prazo">
        {metas.length === 0 ? (
          <EmBreve texto="Nenhuma meta de vida cadastrada para este cliente." />
        ) : (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              {([
                ["curto", "Curto prazo", "< 1 ano"],
                ["medio", "Médio prazo", "1–3 anos"],
                ["longo", "Longo prazo", "> 3 anos"],
              ] as const).map(([h, label, hint]) => (
                <div key={h}>
                  <p className="mb-2 text-xs font-medium text-muted-foreground">
                    {label} <span className="text-muted-foreground/60">· {hint}</span>
                  </p>
                  {porHorizonte[h].length === 0 ? (
                    <p className="rounded-lg border border-dashed border-border/60 px-3 py-4 text-center text-xs text-muted-foreground/70">
                      —
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {porHorizonte[h].map((m) => (
                        <MetaCard key={m.id} m={m} />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
            {porHorizonte.indef.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-medium text-muted-foreground">A definir · sem prazo</p>
                <div className="grid gap-2 md:grid-cols-3">
                  {porHorizonte.indef.map((m) => (
                    <MetaCard key={m.id} m={m} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
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
            <span aria-hidden className="absolute left-[7px] top-1.5 bottom-1.5 w-px bg-border" />
            {regua.map((i) => {
              const { label, Icon } = tipoMeta(i.tipo);
              const corpo = limpo(i.resumo) || limpo(i.rcaNotas);
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

      {/* ── COMO CONDUZIR (PAT DO CLIENTE — sem dado ainda) ── */}
      <Bloco titulo="Como conduzir" Icon={Compass} subtitulo="PAT do cliente">
        <EmBreve texto="Arquétipo e diretrizes de condução (PAT do cliente)." />
      </Bloco>
    </div>
  );
}
