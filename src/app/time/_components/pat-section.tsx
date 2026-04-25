import {
  Brain,
  Upload,
  Trash2,
  RotateCw,
  History,
  AlertTriangle,
  TrendingUp,
  Target,
  Users,
  FileText,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import {
  uploadPatForm,
  atualizarLeituraPatForm,
  excluirPatForm,
  recalcularPatForm,
} from "@/app/actions/pat";
import { cn } from "@/lib/utils";

/**
 * Seção de PAT da ficha — visível para admin + a própria pessoa.
 * Quem chamar deve ter feito a checagem de permissão no parent.
 *
 * @param modo "admin" → vê tudo, edita, faz upload, exclui;
 *             "propria" → read-only do mais recente;
 */
export async function PatSection({
  pessoaId,
  modo,
}: {
  pessoaId: string;
  modo: "admin" | "propria";
}) {
  const pats = await prisma.pat.findMany({
    where: { pessoaId },
    orderBy: { dataPat: "desc" },
  });

  const atual = pats[0] ?? null;
  const historico = pats.slice(1);

  return (
    <section className="rounded-xl border border-violet-500/30 bg-violet-500/5 p-6">
      <header className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-violet-500" />
          <h2 className="text-sm font-semibold text-foreground">PAT — Perfil Comportamental</h2>
        </div>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {modo === "admin" ? "Restrito" : "Seu perfil"}
        </span>
      </header>

      {!atual ? (
        <EmptyState pessoaId={pessoaId} modo={modo} />
      ) : (
        <div className="space-y-5">
          <PatCard pat={atual} modo={modo} />

          {historico.length > 0 && (
            <details>
              <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5">
                <History className="h-3.5 w-3.5" />
                Histórico ({historico.length} PAT{historico.length > 1 ? "s" : ""} anterior{historico.length > 1 ? "es" : ""})
              </summary>
              <div className="mt-3 space-y-3">
                {historico.map((p) => (
                  <PatCard key={p.id} pat={p} modo={modo} compact />
                ))}
              </div>
            </details>
          )}

          {modo === "admin" && (
            <details>
              <summary className="cursor-pointer text-xs font-medium text-violet-600 dark:text-violet-400 hover:text-violet-700 inline-flex items-center gap-1.5">
                <Upload className="h-3.5 w-3.5" />
                Subir novo PAT
              </summary>
              <div className="mt-3">
                <UploadForm pessoaId={pessoaId} />
              </div>
            </details>
          )}
        </div>
      )}
    </section>
  );
}

/* ── Empty state ─────────────────────────────────────────────────────────── */

function EmptyState({
  pessoaId,
  modo,
}: {
  pessoaId: string;
  modo: "admin" | "propria";
}) {
  if (modo !== "admin") {
    return (
      <p className="text-sm text-muted-foreground">
        Você ainda não tem um PAT registrado. Quando o admin subir o relatório da
        Criativa Humana, ele aparecerá aqui.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Faça upload do relatório PAT (PDF da Criativa Humana). O sistema extrai
        automaticamente: estrutural, ícone com intensidade, tendências, risco,
        ambiente, competências e blocos narrativos.
      </p>
      <UploadForm pessoaId={pessoaId} />
    </div>
  );
}

/* ── Form de upload ──────────────────────────────────────────────────────── */

function UploadForm({ pessoaId }: { pessoaId: string }) {
  return (
    <form action={uploadPatForm} className="flex items-end gap-3 flex-wrap">
      <input type="hidden" name="pessoaId" value={pessoaId} />
      <div className="flex-1 min-w-[200px]">
        <label className="block text-xs font-medium text-muted-foreground mb-1.5">
          PAT Executive (PDF, máx. 10MB)
        </label>
        <input
          type="file"
          name="pdf"
          accept="application/pdf,.pdf"
          required
          className="block w-full text-xs text-foreground file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-violet-500 file:text-white file:text-xs file:font-medium hover:file:bg-violet-600 file:cursor-pointer"
        />
      </div>
      <button
        type="submit"
        className="inline-flex items-center gap-2 rounded-lg bg-violet-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-600 transition-colors"
      >
        <Upload className="h-4 w-4" />
        Enviar e extrair
      </button>
    </form>
  );
}

/* ── Card de um PAT específico ───────────────────────────────────────────── */

type PatRecord = {
  id: string;
  pessoaId: string;
  dataPat: Date;
  status: string;
  erroMensagem: string | null;
  filename: string | null;
  perspectiva: string | null;
  ambienteCelula: number | null;
  ambienteNome: string | null;
  orientacao: string | null;
  aproveitamento: string | null;
  principaisCompetencias: string[];
  caracteristicas: string[];
  estrutural: unknown;
  iconeEstrutural: unknown;
  tendencias: unknown;
  risco: unknown;
  competenciasEstrategicas: unknown;
  ambiente: unknown;
  resumido: string | null;
  detalhado: string | null;
  sugestoes: string | null;
  gerencial: string | null;
  pontosFortes: string | null;
  pontosAtencao: string | null;
  estiloComunicacao: string | null;
};

function PatCard({
  pat,
  modo,
  compact = false,
}: {
  pat: PatRecord;
  modo: "admin" | "propria";
  compact?: boolean;
}) {
  const dataLabel = pat.dataPat
    ? new Date(pat.dataPat).toLocaleDateString("pt-BR")
    : "—";

  if (pat.status === "erro") {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4">
        <div className="flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-destructive">
              Erro na extração ({dataLabel})
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {pat.erroMensagem || "erro desconhecido"}
            </p>
            {modo === "admin" && (
              <div className="flex items-center gap-2 mt-3">
                <RecalcButton id={pat.id} />
                <ExcluirButton id={pat.id} />
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-lg border bg-background p-4 space-y-4",
        compact ? "border-border opacity-90" : "border-violet-500/40",
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-violet-500/15 text-violet-700 dark:text-violet-300">
              {compact ? "Anterior" : "Atual"}
            </span>
            <span className="text-sm font-semibold text-foreground">
              PAT de {dataLabel}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 mt-2 text-[10px]">
            {pat.ambienteNome && (
              <Pill tone="violet">
                {pat.ambienteCelula ? `${String(pat.ambienteCelula).padStart(2, "0")} — ` : ""}
                {pat.ambienteNome}
              </Pill>
            )}
            {pat.perspectiva && (
              <Pill tone={pat.perspectiva === "Baixa" ? "amber" : "muted"}>
                Perspectiva {pat.perspectiva}
              </Pill>
            )}
            {pat.orientacao && <Pill>{pat.orientacao}</Pill>}
            {pat.aproveitamento && <Pill>{pat.aproveitamento}</Pill>}
          </div>
        </div>

        {modo === "admin" && (
          <div className="flex items-center gap-1.5">
            <RecalcButton id={pat.id} />
            <ExcluirButton id={pat.id} />
          </div>
        )}
      </div>

      {!compact && (
        <>
          {/* Top 3 + características */}
          {pat.principaisCompetencias.length > 0 && (
            <div>
              <h3 className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                <Target className="h-3 w-3" />
                Principais competências
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {pat.principaisCompetencias.map((c, i) => (
                  <span
                    key={i}
                    className="px-2 py-1 rounded text-xs font-medium bg-violet-500/15 text-violet-700 dark:text-violet-300"
                  >
                    {c}
                  </span>
                ))}
              </div>
            </div>
          )}

          {pat.caracteristicas.length > 0 && (
            <div>
              <h3 className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                Características em palavras
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {pat.caracteristicas.map((c, i) => (
                  <span
                    key={i}
                    className="px-2 py-0.5 rounded text-[10px] bg-muted text-muted-foreground"
                  >
                    {c}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Tendências (barra horizontal) */}
          {pat.tendencias && (
            <TendenciasBlock tendencias={pat.tendencias as Record<string, number | null>} />
          )}

          {/* Ícone Estrutural */}
          {pat.iconeEstrutural && (
            <IconeBlock icone={pat.iconeEstrutural as Record<string, IconeDim | null>} />
          )}

          {/* Risco — só admin (informação sensível) */}
          {modo === "admin" && pat.risco && (
            <RiscoBlock risco={pat.risco as RiscoData} />
          )}

          {/* Blocos narrativos */}
          {(pat.resumido || pat.detalhado || pat.sugestoes || pat.gerencial) && (
            <NarrativaBlock pat={pat} />
          )}

          {/* Ambiente — orientações */}
          {pat.ambiente && <AmbienteBlock ambiente={pat.ambiente as AmbienteData} />}

          {/* Leitura admin (campos textuais escritos por Eduardo) */}
          <LeituraAdmin pat={pat} modo={modo} />

          {/* Footer com filename */}
          {pat.filename && (
            <div className="pt-3 border-t border-border flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <FileText className="h-3 w-3" />
              {pat.filename}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ── Sub-blocos ──────────────────────────────────────────────────────────── */

function TendenciasBlock({ tendencias }: { tendencias: Record<string, number | null> }) {
  const items: { key: string; label: string; left: string; right: string }[] = [
    { key: "foco", label: "Foco", left: "Generalista", right: "Especialista" },
    { key: "orientacao", label: "Orientação", left: "Técnico", right: "Social" },
    { key: "acao", label: "Ação", left: "Mantenedor", right: "Promovedor" },
    { key: "conexao", label: "Conexão", left: "Rápida", right: "Ponderada" },
    { key: "relacionamento", label: "Relacionamento", left: "Formal", right: "Informal" },
    { key: "regras", label: "Regras", left: "Casual", right: "Cuidadoso" },
    { key: "suportePressao", label: "Suporte à pressão", left: "Baixo", right: "Alto" },
  ];
  return (
    <div>
      <h3 className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
        <TrendingUp className="h-3 w-3" />
        Tendências estruturais
      </h3>
      <div className="space-y-2">
        {items.map((it) => {
          const v = tendencias[it.key];
          if (v === null || v === undefined) return null;
          return (
            <div key={it.key}>
              <div className="flex items-center justify-between text-[10px] mb-0.5">
                <span className="text-muted-foreground">{it.left}</span>
                <span className="font-medium text-foreground">{v}%</span>
                <span className="text-muted-foreground">{it.right}</span>
              </div>
              <div className="relative h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="absolute top-0 left-0 h-full bg-violet-500"
                  style={{ width: `${Math.max(0, Math.min(100, v))}%` }}
                />
              </div>
              <div className="text-[9px] text-muted-foreground mt-0.5">{it.label}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

type IconeDim = { tipo?: string; valor?: number; intensidade?: string } | null;

function IconeBlock({ icone }: { icone: Record<string, IconeDim> }) {
  const items = [
    { key: "analiseAprendizagem", label: "Análise & Aprendizagem" },
    { key: "fonteMotivadora", label: "Fonte motivadora" },
    { key: "estrategiaTempo", label: "Estratégia de tempo" },
    { key: "confortoAmbiente", label: "Conforto no ambiente" },
    { key: "orientacao", label: "Orientação" },
    { key: "ponderacao", label: "Ponderação" },
  ];
  return (
    <div>
      <h3 className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
        Ícone estrutural com intensidade
      </h3>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        {items.map((it) => {
          const dim = icone[it.key];
          if (!dim) return null;
          return (
            <div key={it.key} className="rounded border border-border bg-background/40 p-2">
              <div className="text-[9px] text-muted-foreground">{it.label}</div>
              <div className="text-xs font-semibold text-foreground truncate">{dim.tipo}</div>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <span className="text-[10px] text-muted-foreground">{dim.valor}</span>
                <span
                  className={cn(
                    "text-[9px] font-medium px-1 rounded",
                    dim.intensidade === "Extremo"
                      ? "bg-red-500/20 text-red-600 dark:text-red-400"
                      : dim.intensidade === "Intenso"
                        ? "bg-amber-500/20 text-amber-600 dark:text-amber-400"
                        : "bg-muted text-muted-foreground",
                  )}
                >
                  {dim.intensidade}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

type RiscoData = {
  estrutural?: number;
  interno?: number;
  atual?: number;
  competencias?: Array<{ nome: string; potencial: number; esforco: number; comportamento: number }>;
};

function RiscoBlock({ risco }: { risco: RiscoData }) {
  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
      <h3 className="text-[10px] uppercase tracking-wider text-amber-600 dark:text-amber-400 mb-2 flex items-center gap-1.5">
        <AlertTriangle className="h-3 w-3" />
        Risco (admin only)
      </h3>
      <div className="grid grid-cols-3 gap-2 mb-3">
        <RiscoBox label="Estrutural" valor={risco.estrutural} />
        <RiscoBox label="Interno" valor={risco.interno} />
        <RiscoBox label="Atual" valor={risco.atual} />
      </div>
      {risco.competencias && risco.competencias.length > 0 && (
        <details>
          <summary className="cursor-pointer text-[10px] text-muted-foreground hover:text-foreground">
            Competências de risco ({risco.competencias.length})
          </summary>
          <div className="mt-2 space-y-1">
            {risco.competencias.map((c, i) => (
              <div key={i} className="flex items-center justify-between text-[10px]">
                <span className="text-muted-foreground truncate">{c.nome}</span>
                <span className="text-foreground font-medium tabular-nums">
                  {c.potencial.toFixed(1)} / {c.esforco.toFixed(1)} / {c.comportamento.toFixed(1)}
                </span>
              </div>
            ))}
            <p className="text-[9px] text-muted-foreground italic mt-1">
              Potencial / Esforço / Comportamento Expresso
            </p>
          </div>
        </details>
      )}
    </div>
  );
}

function RiscoBox({ label, valor }: { label: string; valor: number | undefined }) {
  if (valor === undefined) return null;
  const tone =
    valor >= 3
      ? "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30"
      : valor >= 2
        ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30"
        : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30";
  return (
    <div className={cn("rounded border p-2 text-center", tone)}>
      <div className="text-lg font-bold">{valor.toFixed(1)}</div>
      <div className="text-[9px] uppercase tracking-wider opacity-80">{label}</div>
    </div>
  );
}

type AmbienteData = {
  celula?: number;
  nome?: string;
  desafios?: number;
  habilidades?: number;
  percepcaoPredominante?: string;
  caracteristicas?: string[];
  orientacoes?: string[];
  recomendacoes?: string[];
};

function AmbienteBlock({ ambiente }: { ambiente: AmbienteData }) {
  return (
    <details className="rounded-lg border border-border bg-background/40 p-3">
      <summary className="cursor-pointer text-xs font-medium text-foreground flex items-center gap-1.5">
        <Users className="h-3.5 w-3.5" />
        Ambiente — {ambiente.nome ?? "—"}
        {ambiente.desafios !== undefined && ambiente.habilidades !== undefined && (
          <span className="text-[10px] text-muted-foreground ml-auto">
            Desafios {ambiente.desafios}% • Habilidades {ambiente.habilidades}%
          </span>
        )}
      </summary>
      <div className="mt-3 space-y-3 text-xs">
        {ambiente.percepcaoPredominante && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
              Percepção predominante
            </div>
            <p className="text-foreground">{ambiente.percepcaoPredominante}</p>
          </div>
        )}
        {ambiente.caracteristicas && ambiente.caracteristicas.length > 0 && (
          <BulletList titulo="Características desta posição" items={ambiente.caracteristicas} />
        )}
        {ambiente.orientacoes && ambiente.orientacoes.length > 0 && (
          <BulletList titulo="Como falar com a pessoa" items={ambiente.orientacoes} />
        )}
        {ambiente.recomendacoes && ambiente.recomendacoes.length > 0 && (
          <BulletList titulo="O que pedir" items={ambiente.recomendacoes} />
        )}
      </div>
    </details>
  );
}

function BulletList({ titulo, items }: { titulo: string; items: string[] }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
        {titulo}
      </div>
      <ul className="list-disc list-inside space-y-0.5 text-foreground">
        {items.map((it, i) => (
          <li key={i}>{it}</li>
        ))}
      </ul>
    </div>
  );
}

function NarrativaBlock({
  pat,
}: {
  pat: { resumido: string | null; detalhado: string | null; sugestoes: string | null; gerencial: string | null };
}) {
  const sections: { titulo: string; conteudo: string | null }[] = [
    { titulo: "Resumido — Rápida descrição de habilidades", conteudo: pat.resumido },
    { titulo: "Detalhado", conteudo: pat.detalhado },
    { titulo: "Sugestões para desenvolvimento", conteudo: pat.sugestoes },
    { titulo: "Gerencial — como liderar essa pessoa", conteudo: pat.gerencial },
  ].filter((s) => s.conteudo);

  if (sections.length === 0) return null;

  return (
    <div className="space-y-2">
      {sections.map((s, i) => (
        <details key={i} className="rounded-lg border border-border bg-background/40 p-3">
          <summary className="cursor-pointer text-xs font-medium text-foreground">
            {s.titulo}
          </summary>
          <div className="mt-2 text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">
            {s.conteudo}
          </div>
        </details>
      ))}
    </div>
  );
}

function LeituraAdmin({
  pat,
  modo,
}: {
  pat: {
    id: string;
    pontosFortes: string | null;
    pontosAtencao: string | null;
    estiloComunicacao: string | null;
  };
  modo: "admin" | "propria";
}) {
  // Modo "propria": mostra leitura como read-only, sem campos vazios
  if (modo === "propria") {
    if (!pat.pontosFortes && !pat.pontosAtencao && !pat.estiloComunicacao) return null;
    return (
      <div className="space-y-2 pt-3 border-t border-border">
        {pat.pontosFortes && (
          <NarrativaItem titulo="Pontos fortes" conteudo={pat.pontosFortes} />
        )}
        {pat.pontosAtencao && (
          <NarrativaItem titulo="Pontos de atenção" conteudo={pat.pontosAtencao} />
        )}
        {pat.estiloComunicacao && (
          <NarrativaItem titulo="Estilo de comunicação" conteudo={pat.estiloComunicacao} />
        )}
      </div>
    );
  }

  return (
    <details className="rounded-lg border border-violet-500/30 bg-violet-500/5 p-3">
      <summary className="cursor-pointer text-xs font-medium text-foreground">
        Leitura adicional do admin (pontos fortes, atenção, estilo de comunicação)
      </summary>
      <form action={atualizarLeituraPatForm} className="mt-3 space-y-3">
        <input type="hidden" name="id" value={pat.id} />
        <TextArea
          label="Pontos fortes"
          name="pontosFortes"
          defaultValue={pat.pontosFortes ?? ""}
        />
        <TextArea
          label="Pontos de atenção"
          name="pontosAtencao"
          defaultValue={pat.pontosAtencao ?? ""}
        />
        <TextArea
          label="Estilo de comunicação"
          name="estiloComunicacao"
          defaultValue={pat.estiloComunicacao ?? ""}
        />
        <button
          type="submit"
          className="rounded border border-border bg-background px-2.5 py-1 text-[10px] font-medium hover:bg-muted transition-colors"
        >
          Salvar leitura
        </button>
      </form>
    </details>
  );
}

function NarrativaItem({ titulo, conteudo }: { titulo: string; conteudo: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
        {titulo}
      </div>
      <p className="text-xs text-foreground whitespace-pre-wrap">{conteudo}</p>
    </div>
  );
}

function TextArea({
  label,
  name,
  defaultValue,
}: {
  label: string;
  name: string;
  defaultValue: string;
}) {
  return (
    <div>
      <label className="block text-[10px] font-medium text-muted-foreground mb-1">
        {label}
      </label>
      <textarea
        name={name}
        defaultValue={defaultValue}
        rows={3}
        className="w-full px-2.5 py-1.5 rounded bg-background border border-border text-xs"
      />
    </div>
  );
}

/* ── Pills, ações ─────────────────────────────────────────────────────────── */

function Pill({
  children,
  tone = "muted",
}: {
  children: React.ReactNode;
  tone?: "muted" | "violet" | "amber";
}) {
  return (
    <span
      className={cn(
        "px-1.5 py-0.5 rounded font-medium",
        tone === "violet" && "bg-violet-500/15 text-violet-700 dark:text-violet-300",
        tone === "amber" && "bg-amber-500/15 text-amber-700 dark:text-amber-400",
        tone === "muted" && "bg-muted text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

function RecalcButton({ id }: { id: string }) {
  return (
    <form action={recalcularPatForm}>
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        className="inline-flex items-center gap-1.5 text-[10px] rounded border border-border bg-background px-2 py-1 hover:bg-muted transition-colors"
        title="Re-extrai do PDF original"
      >
        <RotateCw className="h-3 w-3" />
        Recalcular
      </button>
    </form>
  );
}

function ExcluirButton({ id }: { id: string }) {
  return (
    <form action={excluirPatForm}>
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        className="text-destructive hover:bg-destructive/10 rounded p-1 transition-colors"
        title="Excluir este PAT"
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </form>
  );
}
