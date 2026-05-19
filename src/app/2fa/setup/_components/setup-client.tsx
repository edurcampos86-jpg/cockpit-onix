"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Copy, CheckCircle2 } from "lucide-react";

type SetupResponse = {
  qrCodeDataUrl: string;
  secretBase32: string;
  backupCodes: string[];
};

export function SetupClient() {
  const router = useRouter();
  const [step, setStep] = useState<"gerar" | "scan" | "ativar" | "pronto">("gerar");
  const [setup, setSetup] = useState<SetupResponse | null>(null);
  const [codigo, setCodigo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [secretCopiado, setSecretCopiado] = useState(false);

  async function gerar() {
    setErro(null);
    startTransition(async () => {
      const res = await fetch("/api/auth/2fa/setup", { method: "POST" });
      const json = (await res.json()) as SetupResponse & { error?: string };
      if (!res.ok) {
        setErro(json.error || `HTTP ${res.status}`);
        return;
      }
      setSetup(json);
      setStep("scan");
    });
  }

  async function ativar() {
    setErro(null);
    if (!/^\d{6}$/.test(codigo.trim())) {
      setErro("O código tem 6 dígitos.");
      return;
    }
    startTransition(async () => {
      const res = await fetch("/api/auth/2fa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: codigo.trim(), enableSetup: true }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) {
        setErro(json.error || `HTTP ${res.status}`);
        return;
      }
      setStep("pronto");
    });
  }

  function copiar(s: string) {
    navigator.clipboard.writeText(s);
    setSecretCopiado(true);
    setTimeout(() => setSecretCopiado(false), 2000);
  }

  if (step === "gerar") {
    return (
      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <p className="text-sm text-muted-foreground">
          Vamos gerar um segredo TOTP, um QR code pra você escanear no seu app
          (Authy, Google Authenticator, 1Password) e 10 códigos de backup pra
          emergência. Tudo armazenado cifrado.
        </p>
        <button
          onClick={gerar}
          disabled={isPending}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Gerar QR Code
        </button>
        {erro && (
          <div className="rounded border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
            {erro}
          </div>
        )}
      </div>
    );
  }

  if (step === "scan" && setup) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-border bg-card p-6 space-y-3">
          <h3 className="text-sm font-semibold">1. Escaneie o QR no app authenticator</h3>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={setup.qrCodeDataUrl}
            alt="QR code 2FA"
            className="border border-border rounded mx-auto"
            width={240}
            height={240}
          />
          <p className="text-xs text-muted-foreground">
            Não consegue escanear? Use o secret manual abaixo no app:
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-[11px] font-mono bg-muted rounded p-2 break-all">
              {setup.secretBase32}
            </code>
            <button
              onClick={() => copiar(setup.secretBase32)}
              className="rounded border border-border p-2 hover:bg-muted"
              title="Copiar"
            >
              {secretCopiado ? (
                <CheckCircle2 className="h-4 w-4 text-green-600" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-4 space-y-2">
          <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
            2. SALVE ESTES CÓDIGOS DE BACKUP AGORA
          </h3>
          <p className="text-xs text-amber-800 dark:text-amber-300">
            Se você perder o app authenticator, são esses códigos que recuperam
            acesso. Cada um vale UMA vez. Salve no 1Password/Bitwarden agora —
            essa tela não aparece de novo.
          </p>
          <div className="grid grid-cols-2 gap-1 font-mono text-xs bg-card rounded p-3">
            {setup.backupCodes.map((c) => (
              <div key={c} className="select-all">{c}</div>
            ))}
          </div>
          <button
            onClick={() => copiar(setup.backupCodes.join("\n"))}
            className="text-xs text-amber-900 dark:text-amber-200 underline hover:no-underline"
          >
            Copiar todos
          </button>
        </div>

        <div className="rounded-xl border border-border bg-card p-6 space-y-3">
          <h3 className="text-sm font-semibold">3. Cole o código do app pra confirmar</h3>
          <input
            type="text"
            inputMode="numeric"
            pattern="\d{6}"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="000000"
            className="block w-full text-center text-2xl tracking-widest font-mono rounded-lg border border-border bg-background px-3 py-3 focus:outline-none focus:ring-2 focus:ring-primary/30"
            autoFocus
          />
          <button
            onClick={ativar}
            disabled={isPending || codigo.length !== 6}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Ativar 2FA
          </button>
          {erro && (
            <div className="rounded border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
              {erro}
            </div>
          )}
        </div>
      </div>
    );
  }

  // pronto
  return (
    <div className="rounded-xl border border-green-300 bg-green-50 dark:bg-green-950/20 p-6 space-y-3">
      <CheckCircle2 className="h-8 w-8 text-green-600" />
      <h3 className="text-lg font-semibold text-green-900 dark:text-green-200">
        2FA ativado!
      </h3>
      <p className="text-sm text-green-800 dark:text-green-300">
        Da próxima vez que abrir /juridico você vai precisar do código do app
        (válido por 12h após cada verificação).
      </p>
      <button
        onClick={() => router.push("/juridico/contratos")}
        className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        Ir para Jurídico →
      </button>
    </div>
  );
}
