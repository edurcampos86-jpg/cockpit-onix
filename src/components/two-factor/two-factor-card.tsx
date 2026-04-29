"use client";

import { useState } from "react";
import { ShieldCheck, ShieldOff, Copy, Check } from "lucide-react";
import {
  setupTotp,
  confirmTotp,
  disableTotp,
  type SetupTotpResult,
} from "@/app/actions/two-factor";

type Mode = "idle" | "enrolling" | "confirming" | "disabling";

export function TwoFactorCard({ enabled }: { enabled: boolean }) {
  const [mode, setMode] = useState<Mode>("idle");
  const [enroll, setEnroll] = useState<Extract<SetupTotpResult, { ok: true }> | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [isEnabled, setIsEnabled] = useState(enabled);

  async function startSetup() {
    setError(null);
    const r = await setupTotp();
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setEnroll(r);
    setMode("enrolling");
  }

  async function handleConfirm(formData: FormData) {
    setError(null);
    const r = await confirmTotp(formData);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setIsEnabled(true);
    setMode("idle");
    setEnroll(null);
  }

  async function handleDisable(formData: FormData) {
    setError(null);
    const r = await disableTotp(formData);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setIsEnabled(false);
    setMode("idle");
  }

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  }

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-border bg-accent/30">
        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
          {isEnabled ? (
            <ShieldCheck className="h-4 w-4 text-emerald-500" />
          ) : (
            <ShieldOff className="h-4 w-4 text-primary" />
          )}
        </div>
        <div>
          <h2 className="text-base font-semibold text-foreground">
            Verificação em duas etapas (2FA)
          </h2>
          <p className="text-xs text-muted-foreground">
            {isEnabled
              ? "Ativada — código do app autenticador é exigido a cada login."
              : "Desativada — apenas senha protege sua conta."}
          </p>
        </div>
      </div>

      <div className="p-6 space-y-5">
        {!isEnabled && mode === "idle" && (
          <>
            <p className="text-sm text-muted-foreground">
              Recomendado para qualquer conta com acesso a dados sensíveis.
              Funciona com Google Authenticator, 1Password, Authy, Microsoft
              Authenticator, etc.
            </p>
            <button
              type="button"
              onClick={startSetup}
              className="px-4 py-2.5 bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 text-sm"
            >
              Ativar 2FA
            </button>
          </>
        )}

        {mode === "enrolling" && enroll && (
          <div className="space-y-5">
            <div>
              <p className="text-sm font-medium text-foreground mb-2">
                1. Adicione no seu app autenticador
              </p>
              <p className="text-xs text-muted-foreground mb-3">
                Cole a URL abaixo no app (opção &ldquo;adicionar conta &gt; com URL&rdquo;) ou
                digite o secret manualmente.
              </p>
              <div className="space-y-2">
                <CopyRow
                  label="Secret"
                  value={enroll.secret}
                  copied={copied === "secret"}
                  onCopy={() => copy(enroll.secret, "secret")}
                />
                <CopyRow
                  label="otpauth URL"
                  value={enroll.otpauth}
                  copied={copied === "url"}
                  onCopy={() => copy(enroll.otpauth, "url")}
                />
              </div>
            </div>

            <div className="border-t border-border pt-5">
              <p className="text-sm font-medium text-foreground mb-2">
                2. Salve seus códigos de recuperação
              </p>
              <p className="text-xs text-muted-foreground mb-3">
                Cada código funciona <strong>uma vez</strong>. São sua única forma
                de entrar se perder o app autenticador. Guarde em um cofre de
                senhas — eles não vão aparecer de novo.
              </p>
              <div className="bg-background border border-border rounded-lg p-4 grid grid-cols-2 gap-2 font-mono text-sm">
                {enroll.recoveryCodes.map((c) => (
                  <div key={c}>{c}</div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => copy(enroll.recoveryCodes.join("\n"), "codes")}
                className="mt-2 text-xs text-primary hover:underline flex items-center gap-1"
              >
                {copied === "codes" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                {copied === "codes" ? "Copiado" : "Copiar todos"}
              </button>
            </div>

            <form
              action={handleConfirm}
              className="border-t border-border pt-5 space-y-3"
            >
              <p className="text-sm font-medium text-foreground">
                3. Confirme com o código atual do app
              </p>
              <input
                name="code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                required
                className="w-full px-4 py-2.5 bg-background border border-input rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm tracking-widest text-center"
              />
              {error && (
                <div className="bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-lg px-4 py-3">
                  {error}
                </div>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setMode("idle");
                    setEnroll(null);
                  }}
                  className="px-4 py-2.5 border border-border text-foreground font-medium rounded-lg hover:bg-accent text-sm"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2.5 bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 text-sm"
                >
                  Ativar 2FA
                </button>
              </div>
            </form>
          </div>
        )}

        {isEnabled && mode === "idle" && (
          <button
            type="button"
            onClick={() => setMode("disabling")}
            className="px-4 py-2.5 border border-destructive/30 text-destructive font-medium rounded-lg hover:bg-destructive/10 text-sm"
          >
            Desativar 2FA
          </button>
        )}

        {isEnabled && mode === "disabling" && (
          <form action={handleDisable} className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Para desativar 2FA, confirme sua senha e um código TOTP atual
              (ou um código de recuperação).
            </p>
            <input
              name="password"
              type="password"
              placeholder="Senha atual"
              required
              className="w-full px-4 py-2.5 bg-background border border-input rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
            />
            <input
              name="code"
              type="text"
              inputMode="numeric"
              placeholder="Código TOTP ou de recuperação"
              required
              className="w-full px-4 py-2.5 bg-background border border-input rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm tracking-widest text-center"
            />
            {error && (
              <div className="bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-lg px-4 py-3">
                {error}
              </div>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setMode("idle")}
                className="px-4 py-2.5 border border-border text-foreground font-medium rounded-lg hover:bg-accent text-sm"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-2.5 bg-destructive text-destructive-foreground font-medium rounded-lg hover:bg-destructive/90 text-sm"
              >
                Desativar
              </button>
            </div>
          </form>
        )}

        {mode === "idle" && error && (
          <div className="bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-lg px-4 py-3">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

function CopyRow({
  label,
  value,
  copied,
  onCopy,
}: {
  label: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground w-24 shrink-0">{label}</span>
      <code className="flex-1 px-3 py-2 bg-background border border-border rounded text-xs text-foreground truncate font-mono">
        {value}
      </code>
      <button
        type="button"
        onClick={onCopy}
        className="px-3 py-2 border border-border rounded text-xs hover:bg-accent flex items-center gap-1"
      >
        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        {copied ? "Copiado" : "Copiar"}
      </button>
    </div>
  );
}
