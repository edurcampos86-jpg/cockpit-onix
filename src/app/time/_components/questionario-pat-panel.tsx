"use client";

import { useActionState, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Pencil,
  Save,
  Sparkles,
} from "lucide-react";
import {
  salvarQuestionarioPat,
  type QuestionarioPatActionState,
} from "@/app/actions/questionario-pat";
import type { QuestionarioPatCarregado } from "@/lib/time/questionario-pat-loader";
import type { PerguntaPatId } from "@/lib/time/questionario-pat";
import { QuestionarioPatTimeline } from "./questionario-pat-timeline";

type CampoQuestionario = {
  name:
    | "incentivos"
    | "desmotivadores"
    | "preocupacoesAtuais"
    | "objetivoCurtoPrazo"
    | "objetivoLongoPrazo"
    | "esforcosNecessarios"
    | "apoioEsperado"
    | "indicadoresProgresso";
  label: string;
  fallback: string;
  perguntaId: PerguntaPatId;
  opcional?: boolean;
};

const CAMPOS: readonly CampoQuestionario[] = [
  {
    name: "incentivos",
    perguntaId: "motivadores",
    label: "O que dá energia",
    fallback: "O que mais dá energia e vontade de avançar no trabalho?",
  },
  {
    name: "desmotivadores",
    perguntaId: "desmotivadores",
    label: "O que desmotiva",
    fallback: "Que situações costumam reduzir a energia ou a vontade de avançar?",
  },
  {
    name: "preocupacoesAtuais",
    perguntaId: "preocupacoes",
    label: "Preocupações atuais",
    fallback: "O que mais preocupa esta pessoa neste momento?",
    opcional: true,
  },
  {
    name: "objetivoCurtoPrazo",
    perguntaId: "objetivoCurtoPrazo",
    label: "Objetivo de 90 dias",
    fallback: "Qual avanço concreto faria diferença nos próximos 90 dias?",
  },
  {
    name: "objetivoLongoPrazo",
    perguntaId: "objetivoLongoPrazo",
    label: "Direção de longo prazo",
    fallback: "Que direção esta pessoa quer construir no longo prazo?",
  },
  {
    name: "esforcosNecessarios",
    perguntaId: "esforcosNecessarios",
    label: "Esforço necessário",
    fallback: "Que esforço precisa acontecer para chegar lá?",
  },
  {
    name: "apoioEsperado",
    perguntaId: "apoioEsperado",
    label: "Como apoiar",
    fallback: "Que apoio do líder ajudaria de verdade?",
  },
  {
    name: "indicadoresProgresso",
    perguntaId: "evidenciasProgresso",
    label: "Como medir o avanço",
    fallback: "Que evidência mostrará que o objetivo está avançando?",
  },
];

function dataBr(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const [ano, mes, dia] = iso.slice(0, 10).split("-");
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : null;
}

function perguntaPara(
  campo: CampoQuestionario,
  perguntas: QuestionarioPatCarregado["perguntas"],
): string {
  return perguntas.find((p) => p.id === campo.perguntaId)?.texto ?? campo.fallback;
}

/** Mantém na tela a ordem calibrada e persistida no snapshot do PAT. */
function camposNaOrdemDasPerguntas(
  perguntas: QuestionarioPatCarregado["perguntas"],
): readonly CampoQuestionario[] {
  const posicao = new Map(perguntas.map((pergunta, indice) => [pergunta.id, indice]));
  return [...CAMPOS].sort(
    (a, b) =>
      (posicao.get(a.perguntaId) ?? Number.MAX_SAFE_INTEGER) -
      (posicao.get(b.perguntaId) ?? Number.MAX_SAFE_INTEGER),
  );
}

export function QuestionarioPatPanel({
  dados,
  hoje,
}: {
  dados: QuestionarioPatCarregado;
  hoje: string;
}) {
  const questionario = dados.questionario;
  const [editando, setEditando] = useState(questionario?.status === "rascunho");

  if (!dados.pat) {
    return (
      <section
        aria-labelledby="questionario-pat-title"
        className="rounded-xl border border-violet-500/30 bg-violet-500/5 p-4 sm:p-6"
      >
        <SectionTitle nome={dados.pessoa.nomeCompleto} />
        <div className="mt-4 rounded-lg border border-dashed border-violet-500/30 bg-background/60 p-4">
          <p className="text-sm font-semibold text-foreground">PAT vigente necessário</p>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            É preciso ter um PAT vigente para iniciar ou continuar esta conversa.
          </p>
          {questionario ? (
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              As respostas existentes foram preservadas e voltarão a ficar disponíveis
              quando um PAT vigente for cadastrado.
            </p>
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="questionario-pat-title"
      className="rounded-xl border border-violet-500/30 bg-violet-500/5 p-4 sm:p-6"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <SectionTitle nome={dados.pessoa.nomeCompleto} />
        {questionario ? <StatusQuestionario questionario={questionario} /> : null}
      </div>

      {!questionario && !editando ? (
        <div className="mt-5 rounded-lg border border-dashed border-violet-500/30 bg-background/60 p-5 text-center">
          <ClipboardList aria-hidden="true" className="mx-auto h-7 w-7 text-violet-500" />
          <h3 className="mt-3 text-base font-semibold text-foreground">
            Nenhuma conversa registrada
          </h3>
          <p className="mx-auto mt-1 max-w-xl text-sm leading-relaxed text-muted-foreground">
            Use a próxima conversa 1:1 para registrar o que dá energia, o que pesa e qual
            avanço vocês vão acompanhar.
          </p>
          <button
            type="button"
            onClick={() => setEditando(true)}
            className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
          >
            Iniciar conversa
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
      ) : editando ? (
        <QuestionarioForm dados={dados} onCancel={() => setEditando(false)} />
      ) : questionario ? (
        <>
          <QuestionarioResumo dados={dados} onEdit={() => setEditando(true)} />
          {questionario.status === "concluido" ? (
            <QuestionarioPatTimeline
              pessoaId={dados.pessoa.id}
              acompanhamentos={questionario.acompanhamentos}
              hoje={hoje}
            />
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function SectionTitle({ nome }: { nome: string }) {
  return (
    <div className="min-w-0">
      <div className="flex items-start gap-2">
        <Sparkles aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-violet-500" />
        <div>
          <h2 id="questionario-pat-title" className="text-base font-semibold text-foreground">
            O que importa para {nome}
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            O PAT adapta a forma das perguntas. As respostas são da pessoa.
          </p>
        </div>
      </div>
    </div>
  );
}

function StatusQuestionario({
  questionario,
}: {
  questionario: NonNullable<QuestionarioPatCarregado["questionario"]>;
}) {
  const concluido = questionario.status === "concluido";
  const revisao = dataBr(questionario.proximaRevisao);
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 text-sm">
      <span
        className={
          concluido
            ? "inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1 font-medium text-emerald-700 dark:text-emerald-300"
            : "inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-3 py-1 font-medium text-amber-700 dark:text-amber-300"
        }
      >
        {concluido ? <CheckCircle2 aria-hidden="true" className="h-4 w-4" /> : <Save aria-hidden="true" className="h-4 w-4" />}
        {concluido ? `Concluído em ${dataBr(questionario.atualizadoEm)}` : "Rascunho"}
      </span>
      {revisao ? (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-muted-foreground">
          <CalendarDays aria-hidden="true" className="h-4 w-4" />
          Próxima revisão em {revisao}
        </span>
      ) : null}
    </div>
  );
}

function QuestionarioForm({
  dados,
  onCancel,
}: {
  dados: QuestionarioPatCarregado;
  onCancel: () => void;
}) {
  const [state, action, pending] = useActionState<QuestionarioPatActionState, FormData>(
    salvarQuestionarioPat,
    undefined,
  );
  const questionario = dados.questionario;
  const bloqueado = pending || Boolean(state?.ok);

  return (
    <form action={action} className="mt-5 space-y-5">
      <input type="hidden" name="pessoaId" value={dados.pessoa.id} />
      {questionario ? (
        <input
          type="hidden"
          name="versaoRegistro"
          value={questionario.atualizadoEm}
        />
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {camposNaOrdemDasPerguntas(dados.perguntas).map((campo) => {
          const inputId = `questionario-pat-${campo.name}`;
          const ajudaId = `${inputId}-ajuda`;
          return (
            <div key={campo.name} className="rounded-lg border border-border bg-background p-4">
              <label htmlFor={inputId} className="block text-sm font-semibold text-foreground">
                <span className="block text-sm font-medium text-violet-700 dark:text-violet-300">
                  {campo.label}{campo.opcional ? " (opcional)" : ""}
                </span>
                <span className="mt-1 block leading-relaxed">
                  {perguntaPara(campo, dados.perguntas)}
                </span>
              </label>
              <p id={ajudaId} className="mt-1 text-sm text-muted-foreground">
                Registre com as palavras da pessoa.
              </p>
              <textarea
                id={inputId}
                name={campo.name}
                defaultValue={questionario?.[campo.name] ?? ""}
                rows={4}
                maxLength={6000}
                disabled={bloqueado}
                aria-describedby={ajudaId}
                placeholder="Escreva a resposta da pessoa…"
                className="mt-3 min-h-28 w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm leading-relaxed text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-violet-500 focus:ring-2 focus:ring-violet-500/25 disabled:cursor-not-allowed disabled:opacity-60"
              />
            </div>
          );
        })}
      </div>

      <div className="rounded-lg border border-border bg-background p-4">
        <label htmlFor="questionario-pat-proxima-revisao" className="block text-sm font-semibold text-foreground">
          Próxima revisão
        </label>
        <p id="questionario-pat-proxima-revisao-ajuda" className="mt-1 text-sm text-muted-foreground">
          Combine quando vocês vão conferir se o objetivo continua no rumo.
        </p>
        <input
          id="questionario-pat-proxima-revisao"
          type="date"
          name="proximaRevisao"
          defaultValue={questionario?.proximaRevisao?.slice(0, 10) ?? ""}
          disabled={bloqueado}
          aria-describedby="questionario-pat-proxima-revisao-ajuda"
          className="mt-3 min-h-11 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/25 sm:max-w-xs"
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

      <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-end">
        {state?.ok ? (
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
          >
            Ver resumo
          </button>
        ) : (
          <>
            {questionario ? (
              <button
                type="button"
                onClick={onCancel}
                disabled={pending}
                className="inline-flex min-h-11 items-center justify-center rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 disabled:opacity-60"
              >
                Cancelar
              </button>
            ) : null}
            <button
              type="submit"
              name="status"
              value="rascunho"
              disabled={pending}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Save aria-hidden="true" className="h-4 w-4" />
              {pending ? "Salvando…" : "Salvar rascunho"}
            </button>
            <button
              type="submit"
              name="status"
              value="concluido"
              disabled={pending}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
              {pending ? "Salvando…" : "Concluir conversa"}
            </button>
          </>
        )}
      </div>
    </form>
  );
}

function QuestionarioResumo({
  dados,
  onEdit,
}: {
  dados: QuestionarioPatCarregado;
  onEdit: () => void;
}) {
  const questionario = dados.questionario;
  if (!questionario) return null;

  return (
    <div className="mt-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {camposNaOrdemDasPerguntas(dados.perguntas).map((campo) => {
          const resposta = questionario[campo.name];
          if (!resposta) return null;
          return (
            <div key={campo.name} className="min-w-0 rounded-lg border border-border bg-background p-4">
              <h3 className="text-sm font-semibold text-violet-700 dark:text-violet-300">
                {campo.label}
              </h3>
              <p className="mt-1 break-words whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                {resposta}
              </p>
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
        >
          <Pencil aria-hidden="true" className="h-4 w-4" />
          Revisar respostas
        </button>
      </div>
    </div>
  );
}
