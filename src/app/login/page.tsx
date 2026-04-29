"use client";

import { login, verifyLoginTotp, type LoginState, type VerifyTotpState } from "@/app/actions/auth";
import { useActionState } from "react";
import { Lock, User, ShieldCheck } from "lucide-react";
import { useState } from "react";

function formatCpf(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function CpfPasswordForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, undefined);
  const [cpfDisplay, setCpfDisplay] = useState("");

  if (state && "needsTotp" in state && state.needsTotp) {
    return <TotpForm challenge={state.challenge} />;
  }

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-2">
        <label htmlFor="cpf" className="text-sm font-medium text-foreground">
          CPF
        </label>
        <div className="relative">
          <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            id="cpf"
            name="cpf"
            type="text"
            inputMode="numeric"
            placeholder="000.000.000-00"
            required
            value={cpfDisplay}
            onChange={(e) => setCpfDisplay(formatCpf(e.target.value))}
            className="w-full pl-10 pr-4 py-2.5 bg-background border border-input rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors text-sm tracking-wider"
          />
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor="password" className="text-sm font-medium text-foreground">
          Senha
        </label>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            id="password"
            name="password"
            type="password"
            placeholder="Sua senha"
            required
            className="w-full pl-10 pr-4 py-2.5 bg-background border border-input rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors text-sm"
          />
        </div>
      </div>

      {state?.error && (
        <div className="bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-lg px-4 py-3">
          {state.error}
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full py-2.5 px-4 bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
      >
        {pending ? "Entrando..." : "Entrar"}
      </button>
    </form>
  );
}

function TotpForm({ challenge }: { challenge: string }) {
  const [state, action, pending] = useActionState<VerifyTotpState, FormData>(
    verifyLoginTotp,
    undefined,
  );

  return (
    <form action={action} className="space-y-4">
      <div className="bg-primary/10 border border-primary/20 rounded-lg p-4 flex items-start gap-3">
        <ShieldCheck className="h-5 w-5 text-primary mt-0.5" />
        <div className="text-sm text-foreground">
          <strong>Verificação em duas etapas</strong>
          <p className="text-muted-foreground mt-1">
            Abra seu app autenticador e informe o código de 6 dígitos. Se perdeu o
            acesso ao app, use um código de recuperação.
          </p>
        </div>
      </div>

      <input type="hidden" name="challenge" value={challenge} />

      <div className="space-y-2">
        <label htmlFor="code" className="text-sm font-medium text-foreground">
          Código
        </label>
        <input
          id="code"
          name="code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="123456 ou ABCD-EFGH-IJ"
          required
          autoFocus
          className="w-full px-4 py-2.5 bg-background border border-input rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors text-sm tracking-widest text-center"
        />
      </div>

      {state?.error && (
        <div className="bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-lg px-4 py-3">
          {state.error}
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full py-2.5 px-4 bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
      >
        {pending ? "Verificando..." : "Verificar"}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 mb-4">
            <span className="text-primary font-bold text-2xl">O</span>
          </div>
          <h1 className="text-2xl font-bold text-foreground">Eduardo</h1>
          <p className="text-sm text-muted-foreground mt-1">Mídias Sociais</p>
        </div>

        <div className="bg-card border border-border rounded-xl p-8 shadow-xl">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-foreground">Entrar</h2>
            <p className="text-sm text-muted-foreground">Acesse sua conta para continuar</p>
          </div>

          <CpfPasswordForm />
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Onix Capital &copy; {new Date().getFullYear()} &mdash; Acesso restrito
        </p>
      </div>
    </div>
  );
}
