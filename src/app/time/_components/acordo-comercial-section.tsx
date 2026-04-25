import { Handshake, FileText, Plus, Trash2, History } from "lucide-react";
import { prisma } from "@/lib/prisma";
import {
  criarAcordoForm,
  atualizarAcordoForm,
  encerrarAcordoForm,
  excluirAcordoForm,
  TIPOS_ACORDO,
  labelTipoAcordo,
} from "@/app/actions/acordo-comercial";
import { cn } from "@/lib/utils";

/**
 * Seção de Acordo Comercial da ficha — visível para:
 *  - Admin: tudo (vigente + histórico + criar/editar/excluir)
 *  - A própria pessoa: apenas o ACORDO VIGENTE (read-only)
 *  - Outros: nada (não renderizar este componente)
 *
 * Quem chamar deve ter feito a checagem de permissão no parent.
 */
export async function AcordoComercialSection({
  pessoaId,
  modo,
}: {
  pessoaId: string;
  modo: "admin" | "propria";
}) {
  const acordos = await prisma.acordoComercial.findMany({
    where: { pessoaId },
    orderBy: [{ dataFim: { sort: "asc", nulls: "first" } }, { dataInicio: "desc" }],
  });

  const vigente = acordos.find((a) => a.dataFim === null) ?? null;
  const historico = acordos.filter((a) => a.dataFim !== null);

  return (
    <section className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-6">
      <header className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Handshake className="h-4 w-4 text-emerald-500" />
          <h2 className="text-sm font-semibold text-foreground">Acordo comercial</h2>
        </div>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {modo === "admin" ? "Restrito" : "Seu acordo"}
        </span>
      </header>

      {/* Vigente */}
      {vigente ? (
        <AcordoCard acordo={vigente} vigente modo={modo} />
      ) : (
        <div className="rounded-lg border border-dashed border-border bg-background/40 p-4 text-center text-xs text-muted-foreground">
          {modo === "admin"
            ? "Nenhum acordo vigente. Crie o primeiro abaixo."
            : "Não há acordo comercial registrado para você."}
        </div>
      )}

      {/* Form de novo (admin) — sempre fecha o vigente */}
      {modo === "admin" && (
        <details className="mt-4">
          <summary className="cursor-pointer rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/15">
            <span className="inline-flex items-center gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              {vigente ? "Substituir acordo (encerra o vigente)" : "Cadastrar acordo"}
            </span>
          </summary>
          <div className="mt-3">
            <NovoAcordoForm pessoaId={pessoaId} />
          </div>
        </details>
      )}

      {/* Histórico (admin OU pessoa, mas só admin pode editar) */}
      {historico.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5">
            <History className="h-3.5 w-3.5" />
            Histórico ({historico.length})
          </summary>
          <div className="mt-3 space-y-2">
            {historico.map((a) => (
              <AcordoCard key={a.id} acordo={a} modo={modo} />
            ))}
          </div>
        </details>
      )}
    </section>
  );
}

/* ── Card de um acordo (vigente ou histórico) ──────────────────────────── */

function AcordoCard({
  acordo,
  vigente = false,
  modo,
}: {
  acordo: {
    id: string;
    tipo: string;
    regrasEspeciais: string | null;
    observacoes: string | null;
    dataInicio: Date;
    dataFim: Date | null;
    contratoFilename: string | null;
    contratoBytes: number | null;
  };
  vigente?: boolean;
  modo: "admin" | "propria";
}) {
  return (
    <div
      className={cn(
        "rounded-lg border p-4",
        vigente ? "border-emerald-500/40 bg-background" : "border-border bg-background/40",
      )}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={cn(
                "px-2 py-0.5 rounded text-[10px] font-medium",
                vigente
                  ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {vigente ? "Vigente" : "Encerrado"}
            </span>
            <span className="text-sm font-semibold text-foreground">
              {labelTipoAcordo(acordo.tipo)}
            </span>
          </div>

          <div className="text-[10px] text-muted-foreground mt-1.5">
            Início:{" "}
            <span className="font-medium text-foreground">
              {new Date(acordo.dataInicio).toLocaleDateString("pt-BR")}
            </span>
            {acordo.dataFim && (
              <>
                {" "}
                • Fim:{" "}
                <span className="font-medium text-foreground">
                  {new Date(acordo.dataFim).toLocaleDateString("pt-BR")}
                </span>
              </>
            )}
          </div>

          {acordo.regrasEspeciais && (
            <p className="text-xs text-muted-foreground mt-2 whitespace-pre-wrap">
              <span className="font-medium text-foreground">Regras especiais:</span>{" "}
              {acordo.regrasEspeciais}
            </p>
          )}

          {modo === "admin" && acordo.observacoes && (
            <p className="text-xs text-muted-foreground mt-1.5 whitespace-pre-wrap italic">
              <span className="font-medium">Notas internas:</span> {acordo.observacoes}
            </p>
          )}

          {acordo.contratoFilename && (
            <div className="mt-2 inline-flex items-center gap-1.5 rounded bg-muted px-2 py-1 text-[10px] text-muted-foreground">
              <FileText className="h-3 w-3" />
              {acordo.contratoFilename}
              {acordo.contratoBytes && (
                <span>({Math.round(acordo.contratoBytes / 1024)} KB)</span>
              )}
            </div>
          )}
        </div>

        {modo === "admin" && (
          <div className="flex items-center gap-1.5">
            {vigente && (
              <form action={encerrarAcordoForm}>
                <input type="hidden" name="id" value={acordo.id} />
                <button
                  type="submit"
                  className="text-[10px] rounded border border-border bg-background px-2 py-1 hover:bg-muted transition-colors"
                  title="Encerrar (define data fim hoje)"
                >
                  Encerrar
                </button>
              </form>
            )}
            <form action={excluirAcordoForm}>
              <input type="hidden" name="id" value={acordo.id} />
              <button
                type="submit"
                className="text-destructive hover:bg-destructive/10 rounded p-1.5 transition-colors"
                title="Excluir definitivamente"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </form>
          </div>
        )}
      </div>

      {modo === "admin" && (
        <details className="mt-3">
          <summary className="cursor-pointer text-[10px] text-muted-foreground hover:text-foreground">
            Editar
          </summary>
          <div className="mt-2 pt-3 border-t border-border">
            <EditarAcordoForm acordo={acordo} />
          </div>
        </details>
      )}
    </div>
  );
}

/* ── Form de novo acordo ───────────────────────────────────────────────── */

function NovoAcordoForm({ pessoaId }: { pessoaId: string }) {
  return (
    <form action={criarAcordoForm} className="space-y-3 rounded-lg border border-border bg-background p-4">
      <input type="hidden" name="pessoaId" value={pessoaId} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            Tipo *
          </label>
          <select
            name="tipo"
            required
            defaultValue=""
            className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
          >
            <option value="" disabled>
              Selecione…
            </option>
            {TIPOS_ACORDO.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            Data de início *
          </label>
          <input
            type="date"
            name="dataInicio"
            defaultValue={new Date().toISOString().slice(0, 10)}
            required
            className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1.5">
          Regras especiais (opcional)
        </label>
        <textarea
          name="regrasEspeciais"
          rows={3}
          placeholder="Escala de split, gatilhos de bônus, regras de meta, observações de remuneração…"
          className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1.5">
          Contrato assinado (PDF, opcional, máx 8MB)
        </label>
        <input
          type="file"
          name="contrato"
          accept="application/pdf,.pdf"
          className="block w-full text-xs text-foreground file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-emerald-500 file:text-white file:text-xs file:font-medium hover:file:bg-emerald-500/90 file:cursor-pointer"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1.5">
          Notas internas (admin only)
        </label>
        <textarea
          name="observacoes"
          rows={2}
          className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
        />
      </div>

      <div className="flex items-center gap-2 pt-1">
        <button
          type="submit"
          className="rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-600 transition-colors"
        >
          Criar acordo
        </button>
        <span className="text-[10px] text-muted-foreground">
          Encerra automaticamente o acordo vigente (se houver).
        </span>
      </div>
    </form>
  );
}

/* ── Form de edição de acordo existente ────────────────────────────────── */

function EditarAcordoForm({
  acordo,
}: {
  acordo: {
    id: string;
    tipo: string;
    regrasEspeciais: string | null;
    observacoes: string | null;
  };
}) {
  return (
    <form action={atualizarAcordoForm} className="space-y-3">
      <input type="hidden" name="id" value={acordo.id} />

      <div>
        <label className="block text-[10px] font-medium text-muted-foreground mb-1">
          Tipo
        </label>
        <select
          name="tipo"
          required
          defaultValue={acordo.tipo}
          className="w-full px-2.5 py-1.5 rounded bg-background border border-border text-xs"
        >
          {TIPOS_ACORDO.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-[10px] font-medium text-muted-foreground mb-1">
          Regras especiais
        </label>
        <textarea
          name="regrasEspeciais"
          defaultValue={acordo.regrasEspeciais ?? ""}
          rows={2}
          className="w-full px-2.5 py-1.5 rounded bg-background border border-border text-xs"
        />
      </div>

      <div>
        <label className="block text-[10px] font-medium text-muted-foreground mb-1">
          Notas internas
        </label>
        <textarea
          name="observacoes"
          defaultValue={acordo.observacoes ?? ""}
          rows={2}
          className="w-full px-2.5 py-1.5 rounded bg-background border border-border text-xs"
        />
      </div>

      <div>
        <label className="block text-[10px] font-medium text-muted-foreground mb-1">
          Substituir contrato (PDF, opcional)
        </label>
        <input
          type="file"
          name="contrato"
          accept="application/pdf,.pdf"
          className="block w-full text-[10px] file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:bg-muted file:text-foreground file:text-[10px] file:font-medium hover:file:bg-muted-foreground/20 file:cursor-pointer"
        />
      </div>

      <button
        type="submit"
        className="rounded border border-border bg-background px-2.5 py-1 text-[10px] font-medium hover:bg-muted transition-colors"
      >
        Salvar alterações
      </button>
    </form>
  );
}
