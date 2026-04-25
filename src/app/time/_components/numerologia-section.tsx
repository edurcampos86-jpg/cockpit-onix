import { Sparkles, Upload, RotateCw, AlertTriangle } from "lucide-react";
import { prisma } from "@/lib/prisma";
import {
  uploadContratoSocialForm,
  recalcularNumerologiaForm,
  atualizarLeituraForm,
} from "@/app/actions/numerologia";
import {
  NUMERO_DESCRICAO,
  KARMICO_DESCRICAO,
} from "@/lib/numerologia";
import { cn } from "@/lib/utils";

/**
 * Seção de Numerologia da ficha da pessoa — VISÍVEL APENAS PARA ADMIN.
 * Quem renderiza este componente já deve ter feito a verificação de permissão.
 */
export async function NumerologiaSection({ pessoaId }: { pessoaId: string }) {
  const numerologia = await prisma.numerologia.findUnique({
    where: { pessoaId },
  });

  // Carregar último upload pra mostrar status
  const ultimoUpload = await prisma.contratoSocialUpload.findFirst({
    where: { pessoaId },
    orderBy: { uploadedAt: "desc" },
  });

  return (
    <section className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-6">
      <header className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-amber-500" />
          <h2 className="text-sm font-semibold text-foreground">Numerologia (admin only)</h2>
        </div>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Restrito
        </span>
      </header>

      {!numerologia ? (
        <EmptyState pessoaId={pessoaId} ultimoUpload={ultimoUpload} />
      ) : (
        <div className="space-y-5">
          <NumerologiaGrid n={numerologia} />

          {numerologia.karmicos.length > 0 && (
            <KarmicosBlock karmicos={numerologia.karmicos} />
          )}

          {numerologia.masterNumbers.length > 0 && (
            <MasterNumbersBlock masters={numerologia.masterNumbers} />
          )}

          <LeituraEditor pessoaId={pessoaId} leituraInicial={numerologia.leitura ?? ""} />

          <Footer
            pessoaId={pessoaId}
            nomeFonte={numerologia.nomeFonte}
            dataNasc={numerologia.dataNascFonte}
            calculatedAt={numerologia.calculatedAt}
            anoPessoalRef={numerologia.anoPessoalRef}
          />
        </div>
      )}
    </section>
  );
}

/* ── Empty state — mostra upload ────────────────────────────────────────── */

function EmptyState({
  pessoaId,
  ultimoUpload,
}: {
  pessoaId: string;
  ultimoUpload: {
    status: string;
    erroMensagem: string | null;
    filename: string;
    uploadedAt: Date;
  } | null;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        A numerologia é calculada automaticamente do contrato social. Faça o upload
        do PDF — o sistema extrai nome + data de nascimento e calcula os 6 números
        Pitagóricos.
      </p>

      {ultimoUpload?.status === "erro" && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
          <div className="text-xs">
            <p className="font-medium text-destructive">
              Último upload falhou ({ultimoUpload.filename})
            </p>
            <p className="text-destructive/80 mt-1">
              {ultimoUpload.erroMensagem || "erro desconhecido"}
            </p>
          </div>
        </div>
      )}

      <UploadForm pessoaId={pessoaId} />
    </div>
  );
}

/* ── Form de upload ─────────────────────────────────────────────────────── */

function UploadForm({ pessoaId }: { pessoaId: string }) {
  return (
    <form action={uploadContratoSocialForm} className="flex items-end gap-3 flex-wrap">
      <input type="hidden" name="pessoaId" value={pessoaId} />
      <div className="flex-1 min-w-[200px]">
        <label className="block text-xs font-medium text-muted-foreground mb-1.5">
          Contrato social (PDF, máx. 8MB)
        </label>
        <input
          type="file"
          name="contrato"
          accept="application/pdf,.pdf"
          required
          className="block w-full text-xs text-foreground file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-primary file:text-primary-foreground file:text-xs file:font-medium hover:file:bg-primary/90 file:cursor-pointer"
        />
      </div>
      <button
        type="submit"
        className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-medium text-amber-50 hover:bg-amber-500/90 transition-colors"
      >
        <Upload className="h-4 w-4" />
        Enviar e calcular
      </button>
    </form>
  );
}

/* ── Grid dos 6 números ─────────────────────────────────────────────────── */

function NumerologiaGrid({
  n,
}: {
  n: {
    caminhoVida: number;
    expressao: number;
    alma: number;
    personalidade: number;
    anoPessoal: number;
    anoPessoalRef: number;
  };
}) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
      <NumeroCard label="Caminho da Vida" hint="Essência, missão" value={n.caminhoVida} />
      <NumeroCard label="Expressão" hint="Como se apresenta" value={n.expressao} />
      <NumeroCard label="Alma" hint="O que motiva" value={n.alma} />
      <NumeroCard label="Personalidade" hint="Primeira impressão" value={n.personalidade} />
      <NumeroCard
        label={`Ano Pessoal (${n.anoPessoalRef})`}
        hint="Momento de vida"
        value={n.anoPessoal}
      />
    </div>
  );
}

function NumeroCard({
  label,
  hint,
  value,
}: {
  label: string;
  hint: string;
  value: number;
}) {
  const isMaster = [11, 22, 33].includes(value);
  return (
    <div
      className={cn(
        "rounded-lg border bg-background p-3",
        isMaster ? "border-amber-500/60" : "border-border",
      )}
      title={NUMERO_DESCRICAO[value] ?? ""}
    >
      <div className="flex items-baseline gap-2">
        <span
          className={cn(
            "text-3xl font-bold",
            isMaster ? "text-amber-500" : "text-foreground",
          )}
        >
          {value}
        </span>
        {isMaster && (
          <span className="text-[10px] font-bold uppercase text-amber-500/80">
            MASTER
          </span>
        )}
      </div>
      <div className="text-xs font-medium text-foreground mt-1">{label}</div>
      <div className="text-[10px] text-muted-foreground">{hint}</div>
      <div className="text-[10px] text-muted-foreground mt-1.5 italic">
        {NUMERO_DESCRICAO[value] ?? ""}
      </div>
    </div>
  );
}

/* ── Blocos de kármicos e masters ───────────────────────────────────────── */

function KarmicosBlock({ karmicos }: { karmicos: number[] }) {
  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
      <h3 className="text-xs font-semibold text-destructive mb-2 flex items-center gap-2">
        <AlertTriangle className="h-3.5 w-3.5" />
        Dívidas kármicas detectadas
      </h3>
      <div className="space-y-1.5">
        {karmicos.map((k) => (
          <div key={k} className="flex gap-2 text-xs">
            <span className="font-bold text-destructive shrink-0">{k}</span>
            <span className="text-muted-foreground">
              {KARMICO_DESCRICAO[k] ?? "—"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MasterNumbersBlock({ masters }: { masters: number[] }) {
  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
      <h3 className="text-xs font-semibold text-amber-500 mb-2 flex items-center gap-2">
        <Sparkles className="h-3.5 w-3.5" />
        Master numbers preservados
      </h3>
      <div className="flex flex-wrap gap-2 text-xs">
        {masters.map((m) => (
          <span key={m} className="rounded bg-amber-500/15 px-2 py-1 font-bold text-amber-500">
            {m}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ── Editor da leitura textual ──────────────────────────────────────────── */

function LeituraEditor({
  pessoaId,
  leituraInicial,
}: {
  pessoaId: string;
  leituraInicial: string;
}) {
  return (
    <form action={atualizarLeituraForm} className="space-y-2">
      <input type="hidden" name="pessoaId" value={pessoaId} />
      <label className="block text-xs font-medium text-muted-foreground">
        Leitura / interpretação textual (admin)
      </label>
      <textarea
        name="leitura"
        defaultValue={leituraInicial}
        rows={5}
        placeholder="Pontos fortes, desafios, como lidar com essa pessoa, recomendações de alocação…"
        className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30"
      />
      <button
        type="submit"
        className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
      >
        Salvar leitura
      </button>
    </form>
  );
}

/* ── Footer com info da última extração + ações ─────────────────────────── */

function Footer({
  pessoaId,
  nomeFonte,
  dataNasc,
  calculatedAt,
  anoPessoalRef,
}: {
  pessoaId: string;
  nomeFonte: string;
  dataNasc: Date;
  calculatedAt: Date;
  anoPessoalRef: number;
}) {
  const anoAtual = new Date().getUTCFullYear();
  const precisaRecalcular = anoAtual !== anoPessoalRef;

  return (
    <div className="flex items-center justify-between gap-3 pt-3 border-t border-amber-500/20 text-[10px] text-muted-foreground flex-wrap">
      <div>
        Calculado de <span className="font-medium text-foreground">{nomeFonte}</span>{" "}
        nascido em{" "}
        <span className="font-medium text-foreground">
          {new Date(dataNasc).toLocaleDateString("pt-BR")}
        </span>{" "}
        — última atualização em{" "}
        {new Date(calculatedAt).toLocaleDateString("pt-BR")}
        {precisaRecalcular && (
          <span className="ml-2 text-amber-500 font-medium">
            ⚠ Ano Pessoal está em {anoPessoalRef} — recalcule pra atualizar
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <form action={recalcularNumerologiaForm}>
          <input type="hidden" name="pessoaId" value={pessoaId} />
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded border border-border bg-background px-2.5 py-1 hover:bg-muted transition-colors"
          >
            <RotateCw className="h-3 w-3" />
            Recalcular
          </button>
        </form>
        <details className="relative">
          <summary className="cursor-pointer rounded border border-border bg-background px-2.5 py-1 hover:bg-muted">
            Novo upload
          </summary>
          <div className="absolute right-0 mt-2 w-80 rounded-lg border border-border bg-card p-3 z-10 shadow-lg">
            <UploadForm pessoaId={pessoaId} />
          </div>
        </details>
      </div>
    </div>
  );
}
