"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

/**
 * Editor de aliases de e-mail "tambem sou eu" — usado pra reconhecer
 * forwards (corporativo bloqueado pelo banco → Gmail pessoal). Sem
 * aliases, e-mails forwardados perdem o sinal "destinatario direto =
 * pede acao" e dependem so de palavras-chave.
 *
 * UX: chips removiveis + input de adicionar. Persiste em
 * PUT /api/integracoes/google/aliases. Toast inline (sem dependencia).
 */
export function GoogleAliasesEditor() {
  const [aliases, setAliases] = useState<string[]>([]);
  const [novo, setNovo] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/integracoes/google/aliases");
        if (!res.ok) {
          if (!cancelled) setLoading(false);
          return;
        }
        const data = (await res.json()) as { aliases: string[] };
        if (!cancelled) {
          setAliases(data.aliases);
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const salvar = async (proximos: string[]) => {
    setSaving(true);
    setErro(null);
    setSucesso(null);
    try {
      const res = await fetch("/api/integracoes/google/aliases", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aliases: proximos }),
      });
      const data = (await res.json()) as { aliases?: string[]; error?: string };
      if (!res.ok) {
        setErro(data.error ?? "Erro ao salvar");
        return;
      }
      setAliases(data.aliases ?? []);
      setSucesso("Aliases salvos");
      setTimeout(() => setSucesso(null), 2500);
    } catch {
      setErro("Erro de rede ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const adicionar = async () => {
    const limpo = novo.trim().toLowerCase();
    if (!limpo) return;
    if (aliases.includes(limpo)) {
      setErro("Já está na lista");
      return;
    }
    const proximos = [...aliases, limpo];
    setNovo("");
    await salvar(proximos);
  };

  const remover = async (a: string) => {
    const proximos = aliases.filter((x) => x !== a);
    await salvar(proximos);
  };

  if (loading) {
    return (
      <p className="text-[11px] text-muted-foreground">Carregando aliases...</p>
    );
  }

  return (
    <div className="space-y-2 border-t border-border pt-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Aliases &mdash; outros e-mails que são você
      </p>
      <p className="text-[11px] text-muted-foreground">
        Adicione aqui e-mails que apontam pra você (ex.: corporativo cujo forward chega no Gmail). Quando um e-mail tiver esses endereços no <code>To:</code>/<code>Cc:</code>, será reconhecido como pedindo ação direta.
      </p>
      <div className="flex flex-wrap gap-2">
        {aliases.length === 0 ? (
          <span className="text-[11px] text-muted-foreground italic">
            Nenhum alias adicionado.
          </span>
        ) : (
          aliases.map((a) => (
            <span
              key={a}
              className="inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-xs text-foreground"
            >
              {a}
              <button
                type="button"
                onClick={() => remover(a)}
                disabled={saving}
                className="text-muted-foreground hover:text-red-400 disabled:opacity-50"
                aria-label={`Remover ${a}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))
        )}
      </div>
      <div className="flex gap-2 pt-1">
        <input
          type="email"
          value={novo}
          onChange={(e) => setNovo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void adicionar();
            }
          }}
          placeholder="seu.email@empresa.com"
          disabled={saving}
          className="flex-1 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none disabled:opacity-50"
        />
        <button
          type="button"
          onClick={() => void adicionar()}
          disabled={saving || !novo.trim()}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          Adicionar
        </button>
      </div>
      {erro && <p className="text-xs text-red-400">{erro}</p>}
      {sucesso && <p className="text-xs text-emerald-400">{sucesso}</p>}
    </div>
  );
}
