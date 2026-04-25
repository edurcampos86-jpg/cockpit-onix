import {
  Calendar,
  Mic,
  Upload,
  Trash2,
  RotateCw,
  CheckCircle2,
  Circle,
  Plus,
  Users,
  Sparkles,
  AlertTriangle,
  FileText,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import {
  uploadReuniaoForm,
  toggleProximoPassoForm,
  excluirReuniaoForm,
  recalcularReuniaoForm,
} from "@/app/actions/reuniao-time";
import {
  CATEGORIAS_REUNIAO,
  labelCategoriaReuniao,
  pessoaIniciais,
} from "@/lib/team";
import { cn } from "@/lib/utils";

/**
 * Timeline tipo CRM de reuniões 1:1 / equipe da pessoa.
 * Exibe TODAS as reuniões em que a pessoa é participante, ordenadas por data DESC.
 * Permissão (esta seção é renderizada quando admin OU própria pessoa):
 *  - Admin: cria/edita/exclui, marca checklist
 *  - Própria pessoa: read-only do conteúdo + pode marcar checklist
 */
export async function ReunioesSection({
  pessoaId,
  modo,
}: {
  pessoaId: string;
  modo: "admin" | "propria";
}) {
  // Reuniões da pessoa
  const reunioes = await prisma.reuniaoTime.findMany({
    where: { participantes: { some: { pessoaId } } },
    include: {
      participantes: {
        include: {
          pessoa: {
            select: { id: true, nomeCompleto: true, apelido: true, fotoUrl: true },
          },
        },
      },
    },
    orderBy: { data: "desc" },
  });

  // Para o form de nova reunião (admin): listar pessoas ativas
  const pessoasAtivas =
    modo === "admin"
      ? await prisma.pessoa.findMany({
          where: { status: "ativo" },
          select: { id: true, nomeCompleto: true, apelido: true, cargoFamilia: true },
          orderBy: { nomeCompleto: "asc" },
        })
      : [];

  return (
    <section className="rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-6">
      <header className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Mic className="h-4 w-4 text-cyan-500" />
          <h2 className="text-sm font-semibold text-foreground">
            Reuniões 1:1 e de equipe
          </h2>
        </div>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {reunioes.length > 0
            ? `${reunioes.length} reuni${reunioes.length === 1 ? "ão" : "ões"}`
            : "Sem registros"}
        </span>
      </header>

      {/* Form de nova reunião (admin) */}
      {modo === "admin" && (
        <details className="mb-4">
          <summary className="cursor-pointer rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-2 text-xs font-medium text-cyan-700 dark:text-cyan-300 hover:bg-cyan-500/15 inline-flex items-center gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            Nova reunião
          </summary>
          <div className="mt-3">
            <NovaReuniaoForm pessoaIdAtual={pessoaId} pessoasAtivas={pessoasAtivas} />
          </div>
        </details>
      )}

      {/* Timeline */}
      {reunioes.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">
          {modo === "admin"
            ? "Nenhuma reunião registrada ainda. Cadastre a primeira acima."
            : "Nenhuma reunião registrada ainda."}
        </p>
      ) : (
        <div className="space-y-3">
          {reunioes.map((r) => (
            <ReuniaoCard key={r.id} reuniao={r} modo={modo} />
          ))}
        </div>
      )}
    </section>
  );
}

/* ── Card de uma reunião ────────────────────────────────────────────────── */

type ReuniaoFull = {
  id: string;
  data: Date;
  titulo: string | null;
  categoria: string;
  filename: string | null;
  resumo: string | null;
  proximosPassos: unknown;
  observacoes: string | null;
  status: string;
  erroMensagem: string | null;
  participantes: Array<{
    pessoa: {
      id: string;
      nomeCompleto: string;
      apelido: string | null;
      fotoUrl: string | null;
    };
  }>;
};

type ProximoPasso = { texto: string; concluido: boolean; concluidoEm: string | null };

function ReuniaoCard({
  reuniao,
  modo,
}: {
  reuniao: ReuniaoFull;
  modo: "admin" | "propria";
}) {
  const passos: ProximoPasso[] = Array.isArray(reuniao.proximosPassos)
    ? (reuniao.proximosPassos as ProximoPasso[])
    : [];
  const passosConcluidos = passos.filter((p) => p.concluido).length;

  const dataLabel = new Date(reuniao.data).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  return (
    <div className="rounded-lg border border-border bg-background p-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-cyan-500/15 text-cyan-700 dark:text-cyan-300">
              {labelCategoriaReuniao(reuniao.categoria)}
            </span>
            <span className="text-[10px] text-muted-foreground inline-flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {dataLabel}
            </span>
            {passos.length > 0 && (
              <span className="text-[10px] text-muted-foreground">
                {passosConcluidos}/{passos.length} próximos passos
              </span>
            )}
            {reuniao.status === "erro" && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-destructive/15 text-destructive inline-flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Erro IA
              </span>
            )}
            {reuniao.status === "extraido" && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 inline-flex items-center gap-1">
                <Sparkles className="h-3 w-3" />
                Extraído por IA
              </span>
            )}
          </div>

          {reuniao.titulo && (
            <h3 className="text-sm font-semibold text-foreground mt-1.5">
              {reuniao.titulo}
            </h3>
          )}

          {/* Participantes */}
          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
            <Users className="h-3 w-3 text-muted-foreground" />
            {reuniao.participantes.map((p) => (
              <span
                key={p.pessoa.id}
                className="inline-flex items-center gap-1 text-[10px] bg-muted px-1.5 py-0.5 rounded"
              >
                {p.pessoa.fotoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.pessoa.fotoUrl}
                    alt=""
                    className="h-3.5 w-3.5 rounded-full"
                  />
                ) : (
                  <span className="h-3.5 w-3.5 rounded-full bg-primary/20 text-primary text-[8px] font-bold flex items-center justify-center">
                    {pessoaIniciais(p.pessoa.nomeCompleto)}
                  </span>
                )}
                {p.pessoa.apelido || p.pessoa.nomeCompleto}
              </span>
            ))}
          </div>
        </div>

        {modo === "admin" && (
          <div className="flex items-center gap-1.5">
            {reuniao.status === "extraido" || reuniao.status === "erro" ? (
              <form action={recalcularReuniaoForm}>
                <input type="hidden" name="id" value={reuniao.id} />
                <button
                  type="submit"
                  className="inline-flex items-center gap-1 text-[10px] rounded border border-border bg-background px-2 py-1 hover:bg-muted transition-colors"
                  title="Re-extrai do PDF"
                >
                  <RotateCw className="h-3 w-3" />
                  Recalcular
                </button>
              </form>
            ) : null}
            <form action={excluirReuniaoForm}>
              <input type="hidden" name="id" value={reuniao.id} />
              <button
                type="submit"
                className="text-destructive hover:bg-destructive/10 rounded p-1.5 transition-colors"
                title="Excluir"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </form>
          </div>
        )}
      </div>

      {/* Erro IA */}
      {reuniao.status === "erro" && reuniao.erroMensagem && (
        <div className="mt-3 rounded border border-destructive/30 bg-destructive/5 p-2">
          <p className="text-[10px] text-destructive">{reuniao.erroMensagem}</p>
        </div>
      )}

      {/* Resumo */}
      {reuniao.resumo && (
        <div className="mt-3">
          <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
            Resumo
          </h4>
          <p className="text-xs text-foreground whitespace-pre-wrap leading-relaxed">
            {reuniao.resumo}
          </p>
        </div>
      )}

      {/* Próximos passos / checklist */}
      {passos.length > 0 && (
        <div className="mt-3">
          <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
            Próximos passos
          </h4>
          <div className="space-y-1.5">
            {passos.map((p, i) => (
              <PassoItem
                key={i}
                reuniaoId={reuniao.id}
                indice={i}
                passo={p}
                disabled={false}
              />
            ))}
          </div>
        </div>
      )}

      {/* Observações (admin only) */}
      {modo === "admin" && reuniao.observacoes && (
        <div className="mt-3 pt-3 border-t border-border">
          <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
            Observações internas
          </h4>
          <p className="text-xs text-muted-foreground whitespace-pre-wrap italic">
            {reuniao.observacoes}
          </p>
        </div>
      )}

      {/* Filename */}
      {reuniao.filename && (
        <div className="mt-3 pt-2 border-t border-border flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <FileText className="h-3 w-3" />
          {reuniao.filename}
        </div>
      )}
    </div>
  );
}

/* ── Item da checklist ──────────────────────────────────────────────────── */

function PassoItem({
  reuniaoId,
  indice,
  passo,
  disabled,
}: {
  reuniaoId: string;
  indice: number;
  passo: ProximoPasso;
  disabled: boolean;
}) {
  return (
    <form action={toggleProximoPassoForm} className="flex items-start gap-2">
      <input type="hidden" name="id" value={reuniaoId} />
      <input type="hidden" name="indice" value={String(indice)} />
      <button
        type="submit"
        disabled={disabled}
        className={cn(
          "shrink-0 mt-0.5 transition-colors",
          passo.concluido
            ? "text-emerald-500 hover:text-emerald-600"
            : "text-muted-foreground hover:text-foreground",
        )}
        title={passo.concluido ? "Desmarcar" : "Marcar como concluído"}
      >
        {passo.concluido ? (
          <CheckCircle2 className="h-4 w-4" />
        ) : (
          <Circle className="h-4 w-4" />
        )}
      </button>
      <span
        className={cn(
          "text-xs flex-1",
          passo.concluido ? "line-through text-muted-foreground" : "text-foreground",
        )}
      >
        {passo.texto}
        {passo.concluido && passo.concluidoEm && (
          <span className="ml-1.5 text-[9px] text-muted-foreground">
            ({new Date(passo.concluidoEm).toLocaleDateString("pt-BR")})
          </span>
        )}
      </span>
    </form>
  );
}

/* ── Form de nova reunião ───────────────────────────────────────────────── */

function NovaReuniaoForm({
  pessoaIdAtual,
  pessoasAtivas,
}: {
  pessoaIdAtual: string;
  pessoasAtivas: Array<{
    id: string;
    nomeCompleto: string;
    apelido: string | null;
  }>;
}) {
  return (
    <form
      action={uploadReuniaoForm}
      className="space-y-3 rounded-lg border border-border bg-background p-4"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            Data *
          </label>
          <input
            type="date"
            name="data"
            defaultValue={new Date().toISOString().slice(0, 10)}
            required
            className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            Categoria *
          </label>
          <select
            name="categoria"
            required
            defaultValue=""
            className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
          >
            <option value="" disabled>
              Selecione…
            </option>
            {CATEGORIAS_REUNIAO.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1.5">
          Título (opcional)
        </label>
        <input
          type="text"
          name="titulo"
          placeholder="Ex.: 1:1 com João — Q2 review"
          className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1.5">
          Participantes * (marque as pessoas que estiveram na reunião)
        </label>
        <div className="max-h-40 overflow-y-auto rounded-lg border border-border bg-background/40 p-2 space-y-1">
          {pessoasAtivas.map((p) => (
            <label
              key={p.id}
              className="flex items-center gap-2 text-xs px-2 py-1 rounded hover:bg-muted cursor-pointer"
            >
              <input
                type="checkbox"
                name="participantes"
                value={p.id}
                defaultChecked={p.id === pessoaIdAtual}
                className="h-3.5 w-3.5"
              />
              <span className="text-foreground">
                {p.apelido || p.nomeCompleto}
                {p.apelido && (
                  <span className="text-muted-foreground"> ({p.nomeCompleto})</span>
                )}
              </span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1.5">
          Ata em PDF (opcional, máx 15MB) — Claude extrai resumo + próximos passos
        </label>
        <input
          type="file"
          name="pdf"
          accept="application/pdf,.pdf"
          className="block w-full text-xs text-foreground file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-cyan-500 file:text-white file:text-xs file:font-medium hover:file:bg-cyan-600 file:cursor-pointer"
        />
      </div>

      <details>
        <summary className="cursor-pointer text-[10px] text-muted-foreground hover:text-foreground">
          Sem PDF? Você pode digitar manualmente o resumo
        </summary>
        <div className="mt-2 space-y-2">
          <textarea
            name="resumo"
            rows={3}
            placeholder="Resumo manual da reunião…"
            className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
          />
        </div>
      </details>

      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1.5">
          Notas internas (admin only)
        </label>
        <textarea
          name="observacoes"
          rows={2}
          className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
        />
      </div>

      <div className="flex items-center gap-2 pt-1">
        <button
          type="submit"
          className="inline-flex items-center gap-2 rounded-lg bg-cyan-500 px-3 py-2 text-sm font-medium text-white hover:bg-cyan-600 transition-colors"
        >
          <Upload className="h-4 w-4" />
          Registrar reunião
        </button>
        <span className="text-[10px] text-muted-foreground">
          Se houver PDF, IA extrai resumo + próximos passos automaticamente.
        </span>
      </div>
    </form>
  );
}
