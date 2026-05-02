"use client";

import { resetPassword, type ResetPasswordState } from "@/app/actions/auth";
import { useActionState, useState, useEffect } from "react";
import { Lock, User, KeyRound, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

function formatCpf(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

export default function RecriarSenhaPage() {
  const [state, action, pending] = useActionState<ResetPasswordState, FormData>(resetPassword, undefined);
  const [cpfDisplay, setCpfDisplay] = useState("");
  const router = useRouter();

  useEffect(() => {
    if (state?.ok) {
      const t = setTimeout(() => router.push("/login"), 2000);
      return () => clearTimeout(t);
    }
  }, [state, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 mb-4">
            <KeyRound className="text-primary h-8 w-8" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Recriar senha</h1>
          <p className="text-sm text-muted-foreground mt-1">Use seu código de reset para redefinir a senha</p>
        </div>

        <div className="bg-card border border-border rounded-xl p-8 shadow-xl">
          <form action={action} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="cpf" className="text-sm font-medium text-foreground">CPF</label>
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
              <label htmlFor="secret" className="text-sm font-medium text-foreground">Código de reset</label>
              <div className="relative">
                <ShieldCheck className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  id="secret"
                  name="secret"
                  type="password"
                  placeholder="Definido em PASSWORD_RESET_SECRET"
                  required
                  className="w-full pl-10 pr-4 py-2.5 bg-background border border-input rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors text-sm"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Configure essa env var no Railway antes de usar.
              </p>
            </div>

            <div className="space-y-2">
              <label htmlFor="novaSenha" className="text-sm font-medium text-foreground">Nova senha</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  id="novaSenha"
                  name="novaSenha"
                  type="password"
                  placeholder="Mínimo 6 caracteres"
                  required
                  minLength={6}
                  className="w-full pl-10 pr-4 py-2.5 bg-background border border-input rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors text-sm"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="confirmar" className="text-sm font-medium text-foreground">Confirmar nova senha</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  id="confirmar"
                  name="confirmar"
                  type="password"
                  placeholder="Repita a nova senha"
                  required
                  minLength={6}
                  className="w-full pl-10 pr-4 py-2.5 bg-background border border-input rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors text-sm"
                />
              </div>
            </div>

            {state && !state.ok && (
              <div className="bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-lg px-4 py-3">
                {state.error}
              </div>
            )}
            {state && state.ok && (
              <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 text-sm rounded-lg px-4 py-3">
                {state.message}
              </div>
            )}

            <button
              type="submit"
              disabled={pending || (state && state.ok)}
              className="w-full py-2.5 px-4 bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
              {pending ? "Redefinindo..." : "Redefinir senha"}
            </button>

            <Link
              href="/login"
              className="block text-center text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Voltar para login
            </Link>
          </form>
        </div>
      </div>
    </div>
  );
}
