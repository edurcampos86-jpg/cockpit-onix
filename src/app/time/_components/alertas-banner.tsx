import { AlertTriangle, Info, AlertCircle, Cake } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { alertasAtivos, type Alerta } from "@/lib/team-insights";
import { cn } from "@/lib/utils";

/**
 * Banner de alertas no topo da ficha. Renderiza apenas se houver alertas.
 * Calcula em tempo real consultando PAT mais recente + numerologia + data nasc.
 */
export async function AlertasBanner({ pessoaId }: { pessoaId: string }) {
  const pessoa = await prisma.pessoa.findUnique({
    where: { id: pessoaId },
    select: {
      nomeCompleto: true,
      dataNascimento: true,
      pats: {
        orderBy: { dataPat: "desc" },
        take: 1,
        select: { perspectiva: true, dataPat: true },
      },
      numerologia: { select: { anoPessoalRef: true } },
    },
  });
  if (!pessoa) return null;

  const alertas = alertasAtivos({
    pessoa: { nomeCompleto: pessoa.nomeCompleto, dataNascimento: pessoa.dataNascimento },
    patMaisRecente: pessoa.pats[0]
      ? { perspectiva: pessoa.pats[0].perspectiva, dataPat: pessoa.pats[0].dataPat }
      : null,
    numerologia: pessoa.numerologia,
  });

  if (alertas.length === 0) return null;

  return (
    <section className="space-y-2">
      {alertas.map((a, i) => (
        <AlertaItem key={`${a.tipo}-${i}`} alerta={a} />
      ))}
    </section>
  );
}

function AlertaItem({ alerta }: { alerta: Alerta }) {
  const Icon =
    alerta.tipo === "aniversario_proximo"
      ? Cake
      : alerta.severidade === "alta"
        ? AlertTriangle
        : alerta.severidade === "media"
          ? AlertCircle
          : Info;

  return (
    <div
      className={cn(
        "rounded-lg border p-3 flex items-start gap-3",
        alerta.severidade === "alta" && "border-destructive/40 bg-destructive/5",
        alerta.severidade === "media" && "border-amber-500/40 bg-amber-500/5",
        alerta.severidade === "info" && "border-blue-500/30 bg-blue-500/5",
        alerta.severidade === "baixa" && "border-border bg-card",
      )}
    >
      <Icon
        className={cn(
          "h-4 w-4 mt-0.5 shrink-0",
          alerta.severidade === "alta" && "text-destructive",
          alerta.severidade === "media" && "text-amber-500",
          alerta.severidade === "info" && "text-blue-500",
          alerta.severidade === "baixa" && "text-muted-foreground",
        )}
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground">{alerta.titulo}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{alerta.detalhe}</p>
      </div>
    </div>
  );
}
