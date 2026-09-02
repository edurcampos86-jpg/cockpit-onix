"use client";

import { useActionState, useState } from "react";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Plus } from "lucide-react";
import {
  registrarAcompanhamentoQuestionarioPat,
  type QuestionarioPatActionState,
} from "@/app/actions/questionario-pat";
import type { QuestionarioPatCarregado } from "@/lib/time/questionario-pat-loader";
import { cn } from "@/lib/utils";

type Acompanhamento = NonNullable<
  QuestionarioPatCarregado["questionario"]
>["acompanhamentos"][number];

const DIRECOES = [
  {
    value: "avancando",
    label: "Avançando",
    ajuda: "Há evidência concreta de progresso.",
    icon: ArrowUpRight,
    tone: "text-emerald-700 dark:text-emerald-300 border-emerald-500/40 has-[:checked]:bg-emerald-500/10",
  },
  {
    value: "estavel",
    label: "Estável",
    ajuda: "Sem avanço ou recuo relevante.",
    icon: ArrowRight,
    tone: "text-amber-700 dark:text-amber-300 border-amber-500/40 has-[:checked]:bg-amber-500/10",
  },
  {
    value: "afastando",
    label: "Afastando",
    ajuda: "Os sinais mostram distância do objetivo.",
    icon: ArrowDownRight,
    tone: "text-destructive border-destructive/40 has-[:checked]:bg-destructive/10",
  },
] as const;

function dataBr(iso: string): string {
  const [ano, mes, dia] = iso.slice(0, 10).split("-");
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : iso;
}

function direcaoInfo(direcao: string) {
  return DIRECOES.find((item) => item.value === direcao) ?? DIRECOES[1];
}

export function QuestionarioPatTimeline({
  pessoaId,
  acompanhamentos,
  hoje,
}: {
  pessoaId: string;
  acompanhamentos: Acompanhamento[];
  hoje: string;
}) {
  const [aberto, setAberto] = useState(false);

  return (
    <div className="mt-6 border-t border-violet-500/20 pt-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-base font-semibold text-foreground">Acompanhamento</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Registros são acrescentados à linha do tempo e preservam a evolução.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          aria-expanded={aberto}
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
        >
          <Plus aria-hidden="true" className="h-4 w-4" />
          Registrar acompanhamento
        </button>
      </div>

      {aberto ? (
        <AcompanhamentoForm
          pessoaId={pessoaId}
          hoje={hoje}
          onSuccess={() => setAberto(false)}
        />
      ) : null}

      {acompanhamentos.length > 0 ? (
        <ol className="mt-5 space-y-3" aria-label="Histórico de acompanhamento">
          {acompanhamentos.map((item) => (
            <AcompanhamentoItem key={item.id} item={item} />
          ))}
        </ol>
      ) : (
        <p className="mt-5 rounded-lg border border-dashed border-border bg-background/50 p-4 text-sm text-muted-foreground">
          Nenhum acompanhamento registrado ainda.
        </p>
      )}
    </div>
  );
}

function AcompanhamentoForm({
  pessoaId,
  hoje,
  onSuccess,
}: {
  pessoaId: string;
  hoje: string;
  onSuccess: () => void;
}) {
  const [state, action, pending] = useActionState<QuestionarioPatActionState, FormData>(
    registrarAcompanhamentoQuestionarioPat,
    undefined,
  );
  const bloqueado = pending || Boolean(state?.ok);

  return (
    <form action={action} className="mt-4 space-y-4 rounded-lg border border-border bg-background p-4">
      <input type="hidden" name="pessoaId" value={pessoaId} />

      <fieldset>
        <legend className="text-sm font-semibold text-foreground">Direção atual</legend>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {DIRECOES.map((direcao) => {
            const Icon = direcao.icon;
            return (
              <label
                key={direcao.value}
                className={cn(
                  "flex min-h-14 cursor-pointer items-start gap-2 rounded-lg border bg-background p-3 text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-violet-500",
                  direcao.tone,
                )}
              >
                <input
                  type="radio"
                  name="direcao"
                  value={direcao.value}
                  required
                  disabled={bloqueado}
                  className="mt-1 h-4 w-4 shrink-0"
                />
                <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  <span className="block font-semibold">{direcao.label}</span>
                  <span className="mt-0.5 block leading-relaxed text-muted-foreground">
                    {direcao.ajuda}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div>
          <label htmlFor="acompanhamento-evidencias" className="block text-sm font-semibold text-foreground">
            Evidência observada
          </label>
          <textarea
            id="acompanhamento-evidencias"
            name="evidencias"
            rows={3}
            maxLength={6000}
            required
            disabled={bloqueado}
            placeholder="O que aconteceu desde a última conversa?"
            className="mt-2 min-h-24 w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm leading-relaxed outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/25 disabled:opacity-60"
          />
        </div>
        <div>
          <label htmlFor="acompanhamento-proximos-esforcos" className="block text-sm font-semibold text-foreground">
            Próximo esforço
          </label>
          <textarea
            id="acompanhamento-proximos-esforcos"
            name="proximosEsforcos"
            rows={3}
            maxLength={6000}
            required
            disabled={bloqueado}
            placeholder="Qual é o próximo movimento combinado?"
            className="mt-2 min-h-24 w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm leading-relaxed outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/25 disabled:opacity-60"
          />
        </div>
      </div>

      <div>
        <label htmlFor="acompanhamento-data" className="block text-sm font-semibold text-foreground">
          Data do acompanhamento
        </label>
        <input
          id="acompanhamento-data"
          type="date"
          name="data"
          defaultValue={hoje}
          required
          disabled={bloqueado}
          className="mt-2 min-h-11 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/25 sm:max-w-xs"
        />
      </div>

      <div aria-live="polite" aria-atomic="true">
        {state?.error ? (
          <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {state.error}
          </p>
        ) : state?.ok ? (
          <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
            {state.mensagem}
          </p>
        ) : null}
      </div>

      <div className="flex justify-end">
        {state?.ok ? (
          <button
            type="button"
            onClick={onSuccess}
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
          >
            Fechar
          </button>
        ) : (
          <button
            type="submit"
            disabled={pending}
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "Registrando…" : "Adicionar à linha do tempo"}
          </button>
        )}
      </div>
    </form>
  );
}

function AcompanhamentoItem({ item }: { item: Acompanhamento }) {
  const direcao = direcaoInfo(item.direcao);
  const Icon = direcao.icon;
  return (
    <li className="min-w-0 rounded-lg border border-border bg-background p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={cn("inline-flex items-center gap-1.5 text-sm font-semibold", direcao.tone.split(" ")[0])}>
          <Icon aria-hidden="true" className="h-4 w-4" />
          {direcao.label}
        </span>
        <time dateTime={item.data} className="text-sm text-muted-foreground">
          {dataBr(item.data)}
        </time>
      </div>
      <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="min-w-0">
          <dt className="text-sm font-semibold text-foreground">Evidência</dt>
          <dd className="mt-1 break-words whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
            {item.evidencias}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-sm font-semibold text-foreground">Próximo esforço</dt>
          <dd className="mt-1 break-words whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
            {item.proximosEsforcos}
          </dd>
        </div>
      </dl>
    </li>
  );
}
