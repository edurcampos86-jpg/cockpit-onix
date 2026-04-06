"use client";

import { useState } from "react";
import { Phone, Calendar, AlertTriangle, Clock, CheckCircle2, X } from "lucide-react";

interface Cliente {
  id: string;
  nome: string;
  classificacao: string;
  saldo: number;
  email: string | null;
  telefone: string | null;
  ultimoContatoAt: Date | string | null;
  proximoContatoAt: Date | string | null;
  diasSemContato: number | null;
  status: "atrasado" | "hoje" | "semana" | "mes" | "futuro" | "nunca";
}

const colunas = [
  { id: "atrasado", titulo: "Atrasados", cor: "border-red-400 bg-red-50 dark:bg-red-950/20", icon: AlertTriangle },
  { id: "hoje", titulo: "Hoje", cor: "border-orange-400 bg-orange-50 dark:bg-orange-950/20", icon: Clock },
  { id: "semana", titulo: "Esta semana", cor: "border-amber-400 bg-amber-50 dark:bg-amber-950/20", icon: Calendar },
  { id: "mes", titulo: "Este mês", cor: "border-blue-400 bg-blue-50 dark:bg-blue-950/20", icon: Calendar },
  { id: "nunca", titulo: "Nunca contatados", cor: "border-zinc-400 bg-zinc-50 dark:bg-zinc-900/40", icon: Phone },
] as const;

const classCores: Record<string, string> = {
  A: "bg-amber-200 text-amber-900",
  B: "bg-blue-200 text-blue-900",
  C: "bg-zinc-200 text-zinc-800",
};

export function CadenciaBoard({ clientes }: { clientes: Cliente[] }) {
  const [registrando, setRegistrando] = useState<Cliente | null>(null);
  const [tipo, setTipo] = useState("ligacao");
  const [assunto, setAssunto] = useState("");
  const [resumo, setResumo] = useState("");
  const [enviando, setEnviando] = useState(false);

  const porStatus = (status: string) =>
    clientes.filter((c) => c.status === status).slice(0, 30);

  const moeda = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);

  const registrar = async () => {
    if (!registrando || !assunto.trim()) return;
    setEnviando(true);
    try {
      const res = await fetch(`/api/backoffice/clientes/${registrando.id}/interacoes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo, assunto, resumo }),
      });
      if (res.ok) {
        setRegistrando(null);
        setAssunto("");
        setResumo("");
        setTipo("ligacao");
        window.location.reload();
      }
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {colunas.map((col) => {
          const lista = porStatus(col.id);
          const Icone = col.icon;
          return (
            <div key={col.id} className={`rounded-xl border-2 ${col.cor} p-3 min-h-[400px]`}>
              <div className="flex items-center gap-2 mb-3">
                <Icone className="h-4 w-4" />
                <h3 className="font-semibold text-sm">{col.titulo}</h3>
                <span className="ml-auto text-xs bg-white/60 dark:bg-black/30 px-2 py-0.5 rounded-full">
                  {lista.length}
                </span>
              </div>
              <div className="space-y-2">
                {lista.map((c) => (
                  <div
                    key={c.id}
                    className="rounded-lg bg-white dark:bg-zinc-900 border border-border p-3 text-xs"
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <p className="font-semibold text-sm leading-tight flex-1">{c.nome}</p>
                      <span
                        className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          classCores[c.classificacao]
                        }`}
                      >
                        {c.classificacao}
                      </span>
                    </div>
                    <p className="text-muted-foreground font-mono mb-2">{moeda(c.saldo)}</p>
                    {c.diasSemContato !== null && (
                      <p className="text-muted-foreground mb-2">
                        {c.diasSemContato === 0
                          ? "Contato hoje"
                          : `${c.diasSemContato}d sem contato`}
                      </p>
                    )}
                    <button
                      onClick={() => setRegistrando(c)}
                      className="w-full flex items-center justify-center gap-1 px-2 py-1.5 rounded bg-primary text-primary-foreground text-xs font-medium hover:opacity-90"
                    >
                      <CheckCircle2 className="h-3 w-3" />
                      Registrar contato
                    </button>
                  </div>
                ))}
                {lista.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-4">Vazio</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal de registro */}
      {registrando && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setRegistrando(null)}
        >
          <div
            className="bg-card rounded-xl border shadow-xl w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold text-lg">Registrar contato</h3>
                <p className="text-sm text-muted-foreground">{registrando.nome}</p>
              </div>
              <button onClick={() => setRegistrando(null)} className="text-muted-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Tipo de contato
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: "ligacao", label: "Ligação" },
                    { id: "reuniao", label: "Reunião" },
                    { id: "revisao", label: "Revisão" },
                  ].map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setTipo(t.id)}
                      className={`px-3 py-2 rounded-lg border text-sm ${
                        tipo === t.id
                          ? "border-primary bg-primary/10 font-semibold"
                          : "border-border"
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Assunto *
                </label>
                <input
                  type="text"
                  value={assunto}
                  onChange={(e) => setAssunto(e.target.value)}
                  placeholder="Ex: Revisão trimestral de carteira"
                  className="w-full px-3 py-2 rounded-lg border bg-background text-sm"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Resumo / notas RCA
                </label>
                <textarea
                  value={resumo}
                  onChange={(e) => setResumo(e.target.value)}
                  rows={4}
                  placeholder="Principais pontos discutidos, mudanças de vida, próximos passos..."
                  className="w-full px-3 py-2 rounded-lg border bg-background text-sm"
                />
              </div>

              <button
                onClick={registrar}
                disabled={!assunto.trim() || enviando}
                className="w-full px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50"
              >
                {enviando ? "Registrando..." : "Registrar contato"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
