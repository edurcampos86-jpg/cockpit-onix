"use client";

import { useEffect, useState, useActionState } from "react";
import { usePathname } from "next/navigation";
import { Lightbulb, X, HelpCircle, Cog, Target, CheckCircle2 } from "lucide-react";
import { criarImplementacao, type CriarState } from "@/app/actions/implementacao";
import { EMPRESAS } from "@/lib/empresas-config";
import { AnexosInput } from "@/components/implementacoes/anexos-input";

const initial: CriarState = { ok: false };

// Vocabulário do FAB sobre os mesmos valores do modelo (melhoria|erro|ideia).
const TIPOS = [
  { value: "melhoria", label: "Melhoria" },
  { value: "erro", label: "Correção" },
  { value: "ideia", label: "Nova" },
];

/**
 * Form do modal. Remontado a cada abertura (via key) para resetar o useActionState.
 * Reusa a action criarImplementacao com origem=fab (que retorna {ok:true} sem
 * redirecionar) e captura a rota de origem no campo `pagina`.
 */
function SugestaoForm({
  pathname,
  onDone,
  onPendingChange,
}: {
  pathname: string;
  onDone: () => void;
  onPendingChange: (pending: boolean) => void;
}) {
  const [state, formAction, pending] = useActionState(criarImplementacao, initial);
  const [outraPagina, setOutraPagina] = useState(false);

  // Reporta o envio pro pai bloquear o fechamento enquanto a action roda — evita
  // desmontar o form em voo, perder a confirmação e o usuário reenviar (duplicata).
  useEffect(() => {
    onPendingChange(pending);
  }, [pending, onPendingChange]);

  if (state.ok) {
    return (
      <div className="p-6 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10">
          <CheckCircle2 className="h-6 w-6 text-emerald-500" />
        </div>
        <p className="text-sm font-semibold text-foreground">Sugestão enviada!</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Obrigado — sua ideia entrou na triagem.
        </p>
        <button
          onClick={onDone}
          className="mt-4 inline-flex items-center rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Fechar
        </button>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4 p-5">
      <input type="hidden" name="origem" value="fab" />

      <div>
        <label className="mb-1.5 block text-sm font-semibold text-foreground">Empresa</label>
        <select
          name="empresaId"
          defaultValue={EMPRESAS[0]?.id}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
        >
          {EMPRESAS.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nome}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-semibold text-foreground">Tipo</label>
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
          <Target className="h-4 w-4 text-primary" />
          O quê? <span className="text-destructive">*</span>
        </label>
        <textarea
          name="oQue"
          required
          rows={2}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
          placeholder="O pedido concreto, em uma frase."
        />
      </div>

      <div>
        <label className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Cog className="h-4 w-4 text-primary" />
          Como?
        </label>
        <textarea
          name="como"
          rows={2}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
          placeholder="Uma ideia de solução (opcional)."
        />
      </div>

      <div>
        <label className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <HelpCircle className="h-4 w-4 text-primary" />
          Por quê? <span className="text-destructive">*</span>
        </label>
        <textarea
          name="porQue"
          required
          rows={2}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
          placeholder="O problema / a motivação por trás do pedido."
        />
      </div>

      <AnexosInput />

      {/* Página de origem: default = rota atual; toggle revela input pra outra. */}
      <div className="rounded-lg border border-border bg-background/50 px-3 py-2.5">
        {!outraPagina ? (
          <>
            <p className="text-xs text-muted-foreground">Página de origem</p>
            <p className="truncate text-sm font-medium text-foreground">{pathname}</p>
            <input type="hidden" name="pagina" value={pathname} />
            <button
              type="button"
              onClick={() => setOutraPagina(true)}
              className="mt-1 text-xs text-primary hover:underline"
            >
              É para outra página?
            </button>
          </>
        ) : (
          <>
            <label className="mb-1 block text-xs text-muted-foreground">Qual página? (rota)</label>
            <input
              type="text"
              name="pagina"
              defaultValue={pathname}
              placeholder="/empresas/investimentos/clientes"
              className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus:border-primary focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setOutraPagina(false)}
              className="mt-1 text-xs text-muted-foreground hover:underline"
            >
              Usar a página atual
            </button>
          </>
        )}
      </div>

      {state.error && (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onDone}
          disabled={pending}
          className="rounded-full px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-accent disabled:opacity-60"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
        >
          {pending ? "Enviando…" : "Enviar sugestão"}
        </button>
      </div>
    </form>
  );
}

/**
 * FAB global de sugestão de implementação (todo usuário logado), atrás da flag
 * Config DB IMPLEMENTACOES_INLINE. Botão no canto inferior ESQUERDO (não colide
 * com o FloatingChat, à direita). Montado no AppShell ao lado do FloatingChat.
 */
export function FloatingImplementacoes() {
  const pathname = usePathname();
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/implementacoes/flag")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d?.enabled) setEnabled(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!enabled) return null;

  const abrir = () => {
    setFormKey((k) => k + 1); // remonta o form → reseta useActionState
    setOpen(true);
  };

  // Não fecha enquanto há envio em voo (evita perder a confirmação → duplicata).
  const fechar = () => {
    if (!submitting) setOpen(false);
  };

  return (
    <>
      <button
        onClick={abrir}
        aria-label="Sugerir uma implementação"
        className="fixed bottom-24 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary shadow-lg transition-all hover:bg-primary/90"
        style={{ boxShadow: "0 4px 24px 0 rgba(0,0,0,0.25)" }}
      >
        <Lightbulb className="h-6 w-6 text-primary-foreground" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
          onClick={fechar}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-card shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 border-b border-border bg-primary/5 px-5 py-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary">
                <Lightbulb className="h-4 w-4 text-primary-foreground" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold leading-tight text-foreground">
                  Sugerir uma implementação
                </p>
                <p className="text-[11px] leading-tight text-muted-foreground">
                  Golden Circle · entra na triagem
                </p>
              </div>
              <button
                onClick={fechar}
                aria-label="Fechar"
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <SugestaoForm
              key={formKey}
              pathname={pathname}
              onDone={fechar}
              onPendingChange={setSubmitting}
            />
          </div>
        </div>
      )}
    </>
  );
}
