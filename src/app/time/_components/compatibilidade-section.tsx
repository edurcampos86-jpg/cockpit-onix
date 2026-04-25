import Link from "next/link";
import { Users2, ArrowRightLeft, Heart } from "lucide-react";
import { prisma } from "@/lib/prisma";
import {
  topMatches,
  type TendenciasPat,
  type MatchCandidato,
} from "@/lib/team-insights";
import { labelCargo, pessoaIniciais } from "@/lib/team";
import { cn } from "@/lib/utils";

/**
 * Sugestões de compatibilidade via PAT — admin only.
 * Para uma pessoa-base, calcula:
 *  - Top 3 mais parecidos (similaridade) — mentor/mentorado, dupla técnica
 *  - Top 3 que mais complementam (oposição) — dupla diversificada, time variado
 */
export async function CompatibilidadeSection({ pessoaId }: { pessoaId: string }) {
  // PAT atual da pessoa-base
  const baseRow = await prisma.pat.findFirst({
    where: { pessoaId },
    orderBy: { dataPat: "desc" },
    select: { tendencias: true },
  });

  const baseTendencias = parseTendencias(baseRow?.tendencias);
  if (!baseTendencias) {
    return (
      <section className="rounded-xl border border-pink-500/30 bg-pink-500/5 p-6">
        <h2 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
          <Heart className="h-4 w-4 text-pink-500" />
          Compatibilidade via PAT
        </h2>
        <p className="text-xs text-muted-foreground">
          Sem PAT registrado pra essa pessoa — sem dados pra calcular compatibilidade.
        </p>
      </section>
    );
  }

  // Lista candidatos = todas pessoas ativas exceto a própria que tenham PAT
  const candidatos = await prisma.pessoa.findMany({
    where: {
      status: "ativo",
      id: { not: pessoaId },
      pats: { some: {} },
    },
    select: {
      id: true,
      nomeCompleto: true,
      apelido: true,
      fotoUrl: true,
      cargoFamilia: true,
      pats: {
        orderBy: { dataPat: "desc" },
        take: 1,
        select: { tendencias: true },
      },
    },
  });

  const matchCandidatos: MatchCandidato[] = candidatos.map((c) => ({
    pessoaId: c.id,
    nome: c.nomeCompleto,
    apelido: c.apelido,
    fotoUrl: c.fotoUrl,
    cargoFamilia: c.cargoFamilia,
    tendencias: parseTendencias(c.pats[0]?.tendencias),
  }));

  const similares = topMatches(baseTendencias, matchCandidatos, "similaridade", 3);
  const complementares = topMatches(baseTendencias, matchCandidatos, "complementaridade", 3);

  return (
    <section className="rounded-xl border border-pink-500/30 bg-pink-500/5 p-6 space-y-5">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Heart className="h-4 w-4 text-pink-500" />
          <h2 className="text-sm font-semibold text-foreground">
            Compatibilidade via PAT (admin)
          </h2>
        </div>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Calculado de {matchCandidatos.length} pessoas com PAT
        </span>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <MatchBlock
          titulo="Mais parecidos"
          subtitulo="Bom pra par técnico, mentoria, dupla afinada"
          icon={Users2}
          matches={similares}
        />
        <MatchBlock
          titulo="Mais complementares"
          subtitulo="Bom pra time diversificado, perspectivas opostas"
          icon={ArrowRightLeft}
          matches={complementares}
        />
      </div>

      <p className="text-[10px] text-muted-foreground italic">
        Score baseado nas 7 tendências estruturais do PAT (foco, orientação, ação, conexão,
        relacionamento, regras, suporte à pressão). Use como pista, não como veredito.
      </p>
    </section>
  );
}

function MatchBlock({
  titulo,
  subtitulo,
  icon: Icon,
  matches,
}: {
  titulo: string;
  subtitulo: string;
  icon: React.ComponentType<{ className?: string }>;
  matches: Array<{
    pessoaId: string;
    nome: string;
    apelido: string | null;
    fotoUrl: string | null;
    cargoFamilia: string;
    score: number;
    cobertura: number;
  }>;
}) {
  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <div className="flex items-center gap-2 mb-1">
        <Icon className="h-3.5 w-3.5 text-pink-500" />
        <h3 className="text-xs font-semibold text-foreground">{titulo}</h3>
      </div>
      <p className="text-[10px] text-muted-foreground mb-3">{subtitulo}</p>

      {matches.length === 0 ? (
        <p className="text-[10px] text-muted-foreground italic">Sem candidatos com PAT.</p>
      ) : (
        <div className="space-y-2">
          {matches.map((m) => (
            <Link
              key={m.pessoaId}
              href={`/time/${m.pessoaId}`}
              className="flex items-center gap-2 p-2 rounded hover:bg-muted transition-colors"
            >
              {m.fotoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={m.fotoUrl}
                  alt=""
                  className="h-8 w-8 rounded-full object-cover shrink-0"
                />
              ) : (
                <div className="h-8 w-8 rounded-full bg-primary/15 text-primary flex items-center justify-center text-[10px] font-bold shrink-0">
                  {pessoaIniciais(m.nome)}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-foreground truncate">
                  {m.apelido || m.nome}
                </div>
                <div className="text-[10px] text-muted-foreground truncate">
                  {labelCargo(m.cargoFamilia)}
                </div>
              </div>
              <div className="text-right shrink-0">
                <ScoreBadge score={m.score} />
                {m.cobertura < 100 && (
                  <div className="text-[9px] text-muted-foreground mt-0.5">
                    {m.cobertura}% dados
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function ScoreBadge({ score }: { score: number }) {
  return (
    <span
      className={cn(
        "px-2 py-0.5 rounded text-[10px] font-bold tabular-nums",
        score >= 75 && "bg-pink-500/20 text-pink-600 dark:text-pink-400",
        score >= 50 && score < 75 && "bg-pink-500/15 text-pink-700 dark:text-pink-300",
        score < 50 && "bg-muted text-muted-foreground",
      )}
    >
      {score}%
    </span>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Helpers
   ────────────────────────────────────────────────────────────────────────── */

function parseTendencias(json: unknown): TendenciasPat | null {
  if (!json || typeof json !== "object") return null;
  const obj = json as Record<string, unknown>;
  const num = (k: string): number | null => {
    const v = obj[k];
    return typeof v === "number" ? v : null;
  };
  return {
    foco: num("foco"),
    orientacao: num("orientacao"),
    acao: num("acao"),
    conexao: num("conexao"),
    relacionamento: num("relacionamento"),
    regras: num("regras"),
    suportePressao: num("suportePressao"),
  };
}
