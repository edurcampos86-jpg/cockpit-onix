"use client";

import { useState, useTransition } from "react";
import { Shield, Check, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  MODULOS,
  TEMPLATES,
  type ModuloEcossistema,
  type PermissoesAcesso,
} from "@/lib/permissoes";
import {
  updatePermissoesForm,
  aplicarTemplateForm,
} from "@/app/actions/permissoes";

type Props = {
  pessoaId: string;
  pessoaNome: string;
  permissoesAtuais: PermissoesAcesso;
  /** True se a pessoa-alvo é admin (teamRole==="admin" ou User.role==="admin").
   *  Admin sempre vê tudo — UI só mostra aviso e desabilita os toggles. */
  alvoEhAdmin: boolean;
  /** True se a pessoa ainda não foi convidada (não tem login) — explica que
   *  permissão só começa a valer quando a pessoa logar. */
  semLogin: boolean;
};

export function PermissoesSection({
  pessoaId,
  pessoaNome,
  permissoesAtuais,
  alvoEhAdmin,
  semLogin,
}: Props) {
  const [state, setState] = useState<PermissoesAcesso>(permissoesAtuais);
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<string | null>(null);

  const toggle = (key: ModuloEcossistema) => {
    setState((s) => ({ ...s, [key]: !s[key] }));
  };

  const ativos = Object.values(state).filter(Boolean).length;
  const total = MODULOS.length;
  const dirty = MODULOS.some((m) => state[m.key] !== permissoesAtuais[m.key]);

  return (
    <section className="rounded-xl border border-border bg-card p-6 space-y-5">
      <div className="flex items-start gap-3">
        <Shield className="h-5 w-5 text-primary mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold text-foreground">
            Permissões de acesso ao Ecossistema
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Define quais módulos {pessoaNome} consegue visualizar quando logado.
            Mudanças entram em vigor no <strong>próximo login</strong> da pessoa.
          </p>
        </div>
        <div className="text-right text-xs text-muted-foreground shrink-0">
          <div className="font-mono">
            {ativos}/{total}
          </div>
          <div>módulos</div>
        </div>
      </div>

      {alvoEhAdmin && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5 text-xs text-foreground/80">
          <strong className="text-primary">Esta pessoa é admin.</strong> Admin
          sempre vê tudo no Ecossistema — os toggles abaixo são apenas
          referência e não são aplicados.
        </div>
      )}

      {semLogin && !alvoEhAdmin && (
        <div className="rounded-lg border border-border bg-background/50 px-3 py-2.5 text-xs text-muted-foreground">
          Esta pessoa ainda não tem login no Ecossistema. As permissões abaixo
          ficam pré-configuradas e passam a valer quando ela aceitar o convite.
        </div>
      )}

      {/* ── Templates rápidos ────────────────────────────── */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Zap className="h-3.5 w-3.5" />
          Templates rápidos
        </div>
        <div className="flex flex-wrap gap-2">
          {TEMPLATES.map((t) => (
            <form
              key={t.id}
              action={aplicarTemplateForm}
              className="inline-flex"
            >
              <input type="hidden" name="pessoaId" value={pessoaId} />
              <input type="hidden" name="templateId" value={t.id} />
              <button
                type="submit"
                disabled={alvoEhAdmin || isPending}
                title={t.descricao}
                className={cn(
                  "px-2.5 py-1 rounded-md border border-border text-xs",
                  "hover:border-primary/40 hover:bg-primary/5 transition-colors",
                  "disabled:opacity-50 disabled:cursor-not-allowed"
                )}
              >
                {t.label}
              </button>
            </form>
          ))}
        </div>
      </div>

      {/* ── Toggles por módulo ───────────────────────────── */}
      <form
        action={(fd) => {
          setFeedback(null);
          startTransition(async () => {
            await updatePermissoesForm(fd);
            setFeedback("Permissões salvas. Pessoa precisa fazer logout/login para aplicar.");
          });
        }}
        className="space-y-2"
      >
        <input type="hidden" name="pessoaId" value={pessoaId} />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {MODULOS.map((mod) => {
            const ativo = state[mod.key];
            return (
              <label
                key={mod.key}
                className={cn(
                  "flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors",
                  ativo
                    ? "border-primary/40 bg-primary/5"
                    : "border-border bg-background/40 hover:border-border/80"
                )}
              >
                <input
                  type="checkbox"
                  name={`p_${mod.key}`}
                  checked={ativo}
                  onChange={() => toggle(mod.key)}
                  disabled={alvoEhAdmin}
                  className="mt-0.5 h-4 w-4 rounded border-border accent-primary disabled:opacity-50"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">
                      {mod.label}
                    </span>
                    {ativo && (
                      <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {mod.descricao}
                  </p>
                </div>
              </label>
            );
          })}
        </div>

        <div className="flex items-center justify-between gap-3 pt-2">
          <div className="text-xs text-muted-foreground min-h-[1.25rem]">
            {feedback ??
              (dirty ? "Há mudanças não salvas." : "Tudo salvo.")}
          </div>
          <button
            type="submit"
            disabled={!dirty || alvoEhAdmin || isPending}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
              "bg-primary text-primary-foreground hover:bg-primary/90",
              "disabled:opacity-50 disabled:cursor-not-allowed"
            )}
          >
            {isPending ? "Salvando…" : "Salvar permissões"}
          </button>
        </div>
      </form>
    </section>
  );
}
