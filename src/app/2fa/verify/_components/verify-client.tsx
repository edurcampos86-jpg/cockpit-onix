"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export function VerifyClient({ nextUrl }: { nextUrl: string }) {
  const router = useRouter();
  const [codigo, setCodigo] = useState("");
  const [usandoBackup, setUsandoBackup] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function verificar() {
    setErro(null);
    const limpo = codigo.trim().toUpperCase().replace(/\s+/g, "");
    if (!limpo) {
      setErro("Digite o código");
      return;
    }
    startTransition(async () => {
      const res = await fetch("/api/auth/2fa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: limpo }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) {
        setErro(json.error || `HTTP ${res.status}`);
        return;
      }
      router.push(nextUrl);
      router.refresh();
    });
  }

  return (
    <div className="rounded-xl border border-border bg-card p-6 space-y-4">
      <input
        type="text"
        inputMode={usandoBackup ? "text" : "numeric"}
        value={codigo}
        onChange={(e) => {
          const val = e.target.value;
          if (usandoBackup) {
            setCodigo(val.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12));
          } else {
            setCodigo(val.replace(/\D/g, "").slice(0, 6));
          }
        }}
        onKeyDown={(e) => e.key === "Enter" && verificar()}
        placeholder={usandoBackup ? "BACKUP CODE" : "000000"}
        className="block w-full text-center text-2xl tracking-widest font-mono rounded-lg border border-border bg-background px-3 py-3 focus:outline-none focus:ring-2 focus:ring-primary/30"
        autoFocus
      />
      <button
        onClick={verificar}
        disabled={isPending || codigo.length < 6}
        className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Verificar
      </button>
      <button
        onClick={() => {
          setUsandoBackup((v) => !v);
          setCodigo("");
          setErro(null);
        }}
        className="text-xs text-muted-foreground hover:text-foreground underline"
      >
        {usandoBackup ? "Usar código do app" : "Usar código de backup"}
      </button>
      {erro && (
        <div className="rounded border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
          {erro}
        </div>
      )}
    </div>
  );
}
