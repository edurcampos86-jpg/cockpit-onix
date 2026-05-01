import Link from "next/link";
import {
  BarChart3,
  Building2,
  Briefcase,
  AlertTriangle,
  Users,
  TrendingUp,
  Sparkles,
  Cake,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { ComoFunciona } from "@/components/layout/como-funciona";
import { requireLideranca, isAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import {
  matrizFilialDepartamento,
  distribuicaoPor,
  alertasAtivos,
  type Alerta,
} from "@/lib/team-insights";
import { labelCargo, pessoaIniciais } from "@/lib/team";
import { cn } from "@/lib/utils";

export const metadata = {
  title: "Insights do Time — Ecossistema Onix",
};

/**
 * Página de visões agregadas do time. Acesso: admin + liderança.
 * Mostra:
 *  - Distribuição filial × departamento (heatmap)
 *  - Distribuição de PAT (perspectiva, orientação, aproveitamento)
 *  - Lista de alertas ativos por pessoa
 */
export default async function InsightsPage() {
  const ctx = await requireLideranca();
  const adminMode = isAdmin(ctx);

  // Pessoas ativas + relações
  const pessoas = await prisma.pessoa.findMany({
    where: { status: "ativo" },
    include: {
      filial: { select: { id: true, nome: true } },
      departamento: { select: { id: true, nome: true } },
      pats: {
        orderBy: { dataPat: "desc" },
        take: 1,
      },
      numerologia: { select: { anoPessoalRef: true } },
    },
    orderBy: { nomeCompleto: "asc" },
  });

  const [filiais, departamentos] = await Promise.all([
    prisma.filial.findMany({
      orderBy: [{ isMatriz: "desc" }, { nome: "asc" }],
    }),
    prisma.departamento.findMany({ orderBy: { nome: "asc" } }),
  ]);

  // Matriz filial × departamento
  const { matriz, totalPorFilial, totalPorDepto } = matrizFilialDepartamento(
    pessoas.map((p) => ({ filialId: p.filialId, departamentoId: p.departamentoId })),
    filiais,
    departamentos,
  );

  // Distribuições de PAT
  const pessoasComPat = pessoas.filter((p) => p.pats.length > 0);
  const distPerspectiva = distribuicaoPor(pessoasComPat, (p) => p.pats[0]?.perspectiva ?? null);
  const distOrientacao = distribuicaoPor(pessoasComPat, (p) => p.pats[0]?.orientacao ?? null);
  const distAproveitamento = distribuicaoPor(
    pessoasComPat,
    (p) => p.pats[0]?.aproveitamento ?? null,
  );
  const distAmbiente = distribuicaoPor(
    pessoasComPat,
    (p) => p.pats[0]?.ambienteNome ?? null,
  );

  // Alertas por pessoa
  const hoje = new Date();
  const alertasPorPessoa = pessoas.map((p) => {
    const alertas = alertasAtivos({
      pessoa: { dataNascimento: p.dataNascimento, nomeCompleto: p.nomeCompleto },
      patMaisRecente: p.pats[0]
        ? { perspectiva: p.pats[0].perspectiva, dataPat: p.pats[0].dataPat }
        : null,
      numerologia: p.numerologia,
      hoje,
    });
    return {
      pessoa: p,
      alertas,
    };
  });

  const alertasFlat = alertasPorPessoa
    .flatMap(({ pessoa, alertas }) => alertas.map((a) => ({ pessoa, alerta: a })))
    .sort((a, b) => severidadeOrder(b.alerta.severidade) - severidadeOrder(a.alerta.severidade));

  return (
    <div className="min-h-screen">
      <PageHeader
        title="Insights do Time"
        description="Visões agregadas, distribuições de PAT e alertas ativos"
      >
        <Link
          href="/time"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Voltar para o time
        </Link>
      </PageHeader>

      <div className="p-8 space-y-6 max-w-7xl">
        <ComoFunciona
          proposito="Visão olho-de-águia do time. Combina distribuição organizacional, perfis comportamentais (PAT) e situações que merecem atenção (alertas)."
          comoUsar="Use para tomar decisões de alocação, identificar pessoas em momento delicado (Perspectiva Baixa) e ver gaps de cobertura por filial/departamento."
          comoAjuda="Gestão de pessoas baseada em dados, não em achismo. Ver o time como sistema, não como soma de indivíduos."
        />

        {/* Estatísticas rápidas */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <Stat icon={Users} label="Pessoas ativas" valor={pessoas.length} tone="primary" />
          <Stat
            icon={Sparkles}
            label="Com PAT"
            valor={pessoasComPat.length}
            sub={`${pessoas.length > 0 ? Math.round((pessoasComPat.length / pessoas.length) * 100) : 0}% cobertura`}
          />
          <Stat icon={AlertTriangle} label="Alertas ativos" valor={alertasFlat.length} tone="amber" />
          <Stat icon={Building2} label="Filiais" valor={filiais.length} />
        </div>

        {/* Heatmap filial × departamento */}
        <section className="rounded-xl border border-border bg-card p-6">
          <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" />
            Distribuição Filial × Departamento
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">
                    Filial
                  </th>
                  {departamentos.map((d) => (
                    <th
                      key={d.id}
                      className="text-center py-2 px-3 font-medium text-muted-foreground whitespace-nowrap"
                    >
                      {d.nome}
                    </th>
                  ))}
                  <th className="text-center py-2 px-3 font-medium text-foreground">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {matriz.map((row) => (
                  <tr key={row.filial.id} className="border-b border-border/50">
                    <td className="py-2 px-3 font-medium text-foreground">
                      {row.filial.nome}
                    </td>
                    {row.cells.map((c) => (
                      <td key={c.depto.id} className="py-2 px-3 text-center">
                        <HeatCell count={c.count} max={pessoas.length} />
                      </td>
                    ))}
                    <td className="py-2 px-3 text-center font-bold text-foreground">
                      {totalPorFilial[row.filial.id] ?? 0}
                    </td>
                  </tr>
                ))}
                <tr className="border-t-2 border-border">
                  <td className="py-2 px-3 font-bold text-foreground">Total</td>
                  {departamentos.map((d) => (
                    <td
                      key={d.id}
                      className="py-2 px-3 text-center font-bold text-foreground"
                    >
                      {totalPorDepto[d.id] ?? 0}
                    </td>
                  ))}
                  <td className="py-2 px-3 text-center font-bold text-foreground">
                    {pessoas.length}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Distribuições PAT */}
        {pessoasComPat.length > 0 && (
          <section className="rounded-xl border border-violet-500/30 bg-violet-500/5 p-6">
            <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-violet-500" />
              Distribuições do PAT (entre {pessoasComPat.length} pessoas com perfil)
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <DistribuicaoCard
                titulo="Perspectiva"
                items={distPerspectiva}
                total={pessoasComPat.length}
              />
              <DistribuicaoCard
                titulo="Orientação"
                items={distOrientacao}
                total={pessoasComPat.length}
              />
              <DistribuicaoCard
                titulo="Aproveitamento"
                items={distAproveitamento}
                total={pessoasComPat.length}
              />
              <DistribuicaoCard
                titulo="Ambiente atual"
                items={distAmbiente}
                total={pessoasComPat.length}
              />
            </div>
          </section>
        )}

        {/* Alertas ativos */}
        <section className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-6">
          <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Alertas ativos ({alertasFlat.length})
          </h2>

          {alertasFlat.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">
              Nenhum alerta ativo. Time saudável.
            </p>
          ) : (
            <div className="space-y-2">
              {alertasFlat.map(({ pessoa, alerta }, i) => (
                <Link
                  key={`${pessoa.id}-${alerta.tipo}-${i}`}
                  href={`/time/${pessoa.id}`}
                  className="flex items-start gap-3 rounded-lg border border-border bg-background p-3 hover:border-amber-500/40 transition-colors"
                >
                  <div className="h-8 w-8 rounded-full bg-primary/15 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                    {pessoaIniciais(pessoa.nomeCompleto)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-foreground">
                        {pessoa.apelido || pessoa.nomeCompleto}
                      </span>
                      <SeveridadeBadge severidade={alerta.severidade} />
                    </div>
                    <p className="text-xs text-foreground mt-0.5">{alerta.titulo}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {alerta.detalhe} • {labelCargo(pessoa.cargoFamilia)} •{" "}
                      {pessoa.filial.nome}/{pessoa.departamento.nome}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Aniversariantes do mês (se admin) */}
        {adminMode && (
          <AniversariantesDoMes pessoas={pessoas} />
        )}
      </div>
    </div>
  );
}

/* ── Componentes ─────────────────────────────────────────────────────────── */

function Stat({
  icon: Icon,
  label,
  valor,
  sub,
  tone = "muted",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  valor: number;
  sub?: string;
  tone?: "primary" | "amber" | "muted";
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
      <div
        className={cn(
          "h-10 w-10 rounded-lg flex items-center justify-center shrink-0",
          tone === "primary" && "bg-primary/15 text-primary",
          tone === "amber" && "bg-amber-500/15 text-amber-500",
          tone === "muted" && "bg-muted text-muted-foreground",
        )}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <div className="text-2xl font-bold text-foreground leading-none">{valor}</div>
        <div className="text-xs text-muted-foreground mt-1">{label}</div>
        {sub && <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

function HeatCell({ count, max }: { count: number; max: number }) {
  if (count === 0) {
    return <span className="text-muted-foreground/40">—</span>;
  }
  // Intensidade da célula proporcional ao count vs maior valor possível (limitado em max/3)
  const ref = Math.max(1, Math.ceil(max / 5));
  const intensity = Math.min(1, count / ref);
  const alpha = 0.1 + intensity * 0.5;
  return (
    <span
      className="inline-block px-2 py-0.5 rounded text-foreground font-semibold"
      style={{ backgroundColor: `rgba(99, 102, 241, ${alpha})` }} // indigo-ish
    >
      {count}
    </span>
  );
}

function DistribuicaoCard({
  titulo,
  items,
  total,
}: {
  titulo: string;
  items: { label: string; valor: number }[];
  total: number;
}) {
  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <h3 className="text-xs font-semibold text-foreground mb-3">{titulo}</h3>
      {items.length === 0 ? (
        <p className="text-[10px] text-muted-foreground italic">Sem dados</p>
      ) : (
        <div className="space-y-1.5">
          {items.map((it) => {
            const pct = total > 0 ? Math.round((it.valor / total) * 100) : 0;
            return (
              <div key={it.label}>
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-foreground truncate">{it.label}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {it.valor} ({pct}%)
                  </span>
                </div>
                <div className="relative h-1 rounded-full bg-muted overflow-hidden mt-0.5">
                  <div
                    className="absolute top-0 left-0 h-full bg-violet-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SeveridadeBadge({ severidade }: { severidade: string }) {
  return (
    <span
      className={cn(
        "px-1.5 py-0.5 rounded text-[10px] font-medium uppercase",
        severidade === "alta" && "bg-destructive/15 text-destructive",
        severidade === "media" && "bg-amber-500/20 text-amber-600 dark:text-amber-400",
        severidade === "baixa" && "bg-muted text-muted-foreground",
        severidade === "info" && "bg-blue-500/15 text-blue-600 dark:text-blue-400",
      )}
    >
      {severidade}
    </span>
  );
}

function severidadeOrder(s: Alerta["severidade"]): number {
  return s === "alta" ? 4 : s === "media" ? 3 : s === "baixa" ? 2 : 1;
}

/* ── Aniversariantes do mês ──────────────────────────────────────────────── */

function AniversariantesDoMes({
  pessoas,
}: {
  pessoas: Array<{
    id: string;
    nomeCompleto: string;
    apelido: string | null;
    dataNascimento: Date | null;
    cargoFamilia: string;
  }>;
}) {
  const mesAtual = new Date().getUTCMonth();
  const aniversariantes = pessoas
    .filter((p) => p.dataNascimento && new Date(p.dataNascimento).getUTCMonth() === mesAtual)
    .sort((a, b) => {
      const da = new Date(a.dataNascimento!).getUTCDate();
      const db = new Date(b.dataNascimento!).getUTCDate();
      return da - db;
    });

  if (aniversariantes.length === 0) return null;

  return (
    <section className="rounded-xl border border-pink-500/30 bg-pink-500/5 p-6">
      <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
        <Cake className="h-4 w-4 text-pink-500" />
        Aniversariantes do mês ({aniversariantes.length})
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
        {aniversariantes.map((p) => (
          <Link
            key={p.id}
            href={`/time/${p.id}`}
            className="flex items-center gap-2 rounded-lg border border-border bg-background p-2 hover:border-pink-500/40 transition-colors"
          >
            <div className="h-8 w-8 rounded-full bg-pink-500/15 text-pink-600 dark:text-pink-400 flex items-center justify-center text-xs font-bold shrink-0">
              {pessoaIniciais(p.nomeCompleto)}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-medium text-foreground truncate">
                {p.apelido || p.nomeCompleto}
              </div>
              <div className="text-[10px] text-muted-foreground">
                {p.dataNascimento
                  ? new Date(p.dataNascimento).toLocaleDateString("pt-BR", {
                      day: "numeric",
                      month: "long",
                    })
                  : "—"}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

// Briefcase import sentinel (avoid unused warning if reorderings happen)
const _Briefcase = Briefcase;
const _BarChart3 = BarChart3;
void _Briefcase;
void _BarChart3;
