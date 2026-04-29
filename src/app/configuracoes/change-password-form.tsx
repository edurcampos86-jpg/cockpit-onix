"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { changePassword, type ChangePasswordState } from "@/app/actions/settings";
import { Lock, Eye, EyeOff, CheckCircle2, KeyRound } from "lucide-react";

function PasswordInput({
  id,
  name,
  label,
  placeholder,
}: {
  id: string;
  name: string;
  label: string;
  placeholder: string;
}) {
  const [show, setShow] = useState(false);

  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
      </label>
      <div className="relative">
        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          id={id}
          name={name}
          type={show ? "text" : "password"}
          placeholder={placeholder}
          required
          className="w-full pl-10 pr-10 py-2.5 bg-background border border-input rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors text-sm"
        />
        <button
          type="button"
          onClick={() => setShow(!show)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState<ChangePasswordState, FormData>(
    changePassword,
    undefined,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.success) formRef.current?.reset();
  }, [state?.success]);

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-border bg-accent/30">
        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
          <KeyRound className="h-4 w-4 text-primary" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-foreground">Alterar Senha</h2>
          <p className="text-xs text-muted-foreground">
            Atualize sua senha de acesso ao Cockpit
          </p>
        </div>
      </div>

      <form ref={formRef} action={action} className="p-6 space-y-5">
        <PasswordInput
          id="currentPassword"
          name="currentPassword"
          label="Senha Atual"
          placeholder="Digite sua senha atual"
        />

        <div className="border-t border-border pt-5">
          <PasswordInput
            id="newPassword"
            name="newPassword"
            label="Nova Senha"
            placeholder="Mínimo 12 caracteres com letras e números"
          />
        </div>

        <PasswordInput
          id="confirmPassword"
          name="confirmPassword"
          label="Confirmar Nova Senha"
          placeholder="Repita a nova senha"
        />

        {state?.success && (
          <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm rounded-lg px-4 py-3">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            Senha alterada com sucesso!
          </div>
        )}

        {state?.error && (
          <div className="bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-lg px-4 py-3">
            {state.error}
          </div>
        )}

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={pending}
            className="px-6 py-2.5 bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            {pending ? "Salvando..." : "Salvar Nova Senha"}
          </button>
        </div>
      </form>
    </div>
  );
}
