"use client";

import Link from "next/link";
import { useActionState } from "react";
import { ArrowLeft, HelpCircle, Cog, Target } from "lucide-react";
import {
  criarImplementacao,
  type CriarState,
} from "@/app/actions/implementacao";

const initial: CriarState = { ok: false };

const TIPOS = [
  { value: "melhoria", label: "Melhoria" },
  { value: "erro", label: "Erro" },
  { value: "ideia", label: "Ideia" },
];

export function ImplementacaoForm({
  empresaId,
  empresaNome,
}: {
  empresaId: string;
  empresaNome: string;
}) {
  const [state, formAction, pending] = useActionState(
    criarImplementacao,
    initial,
  );

  return (
    <div className="mx-auto max-w-2xl p-6">
      <Link
        href="/configuracoes/implementacoes"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Central de Implementações
      </Link>

      <div className="mb-6">
        <h1 className="text-xl font-bold text-foreground">Nova implementação</h1>
        <p className="text-sm text-muted-foreground">
          {empresaNome} · conte no formato <strong>Golden Circle</strong>
        </p>
      </div>

      <form action={formAction} className="space-y-5">
        <input type="hidden" name="empresaId" value={empresaId} />

        <div>
          <label className="mb-1.5 block text-sm font-semibold text-foreground">
            Tipo
          </label>
          <select
            name="tipo"
            defaultValue="melhoria"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          >
            {TIPOS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <HelpCircle className="h-4 w-4 text-primary" />
            Por quê? <span className="text-destructive">*</span>
          </label>
          <p className="mb-1.5 text-xs text-muted-foreground">
            A motivação / o problema por trás do pedido.
          </p>
          <textarea
            name="porQue"
            required
            rows={3}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
            placeholder="Ex.: hoje perdemos tempo consolidando relatórios na mão…"
          />
        </div>

        <div>
          <label className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <Cog className="h-4 w-4 text-primary" />
            Como?
          </label>
          <p className="mb-1.5 text-xs text-muted-foreground">
            Uma ideia de como resolver (opcional).
          </p>
          <textarea
            name="como"
            rows={2}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
            placeholder="Ex.: uma tela que agrega automaticamente…"
          />
        </div>

        <div>
          <label className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <Target className="h-4 w-4 text-primary" />
            O quê? <span className="text-destructive">*</span>
          </label>
          <p className="mb-1.5 text-xs text-muted-foreground">
            O pedido concreto, em uma frase.
          </p>
          <textarea
            name="oQue"
            required
            rows={2}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
            placeholder="Ex.: criar dashboard único de receita por assessor"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-semibold text-foreground">
            Print (opcional)
          </label>
          <input
            type="file"
            name="print"
            accept="image/*"
            className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-full file:border-0 file:bg-secondary file:px-4 file:py-1.5 file:text-sm file:font-semibold file:text-secondary-foreground hover:file:bg-secondary/80"
          />
        </div>

        {state.error && (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {state.error}
          </p>
        )}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            {pending ? "Enviando…" : "Enviar"}
          </button>
          <Link
            href="/configuracoes/implementacoes"
            className="inline-flex items-center rounded-full px-5 py-2 text-sm font-medium text-muted-foreground hover:bg-accent"
          >
            Cancelar
          </Link>
        </div>
      </form>
    </div>
  );
}
