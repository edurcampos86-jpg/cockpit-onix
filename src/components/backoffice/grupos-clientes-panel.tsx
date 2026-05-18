"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Link2, Unlink, Users } from "lucide-react";

interface Cliente {
  id: string;
  nome: string;
  numeroConta: string;
  assessorNome: string | null;
}

interface Grupo {
  externalId: string;
  nome: string;
  instanceId: string;
  instanceNome: string;
  contactId: string | null;
  lastMessageAt: string | null;
  mapeamentoId: string | null;
  clienteId: string | null;
  clienteNome: string | null;
  clienteConta: string | null;
}

export function GruposClientesPanel({ clientes }: { clientes: Cliente[] }) {
  const [grupos, setGrupos] = useState<Grupo[] | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [filtro, setFiltro] = useState("");
  const [soNaoMapeados, setSoNaoMapeados] = useState(false);
  const [acaoAtiva, setAcaoAtiva] = useState<string | null>(null);

  useEffect(() => {
    carregar();
  }, []);

  async function carregar() {
    setCarregando(true);
    setErro(null);
    try {
      const res = await fetch("/api/backoffice/grupos-datacrazy");
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setGrupos(data.grupos);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar grupos");
    } finally {
      setCarregando(false);
    }
  }

  const filtrados = useMemo(() => {
    if (!grupos) return [];
    const f = filtro.trim().toLowerCase();
    return grupos.filter((g) => {
      if (soNaoMapeados && g.mapeamentoId) return false;
      if (!f) return true;
      return (
        g.nome.toLowerCase().includes(f) ||
        (g.clienteNome ?? "").toLowerCase().includes(f) ||
        g.instanceNome.toLowerCase().includes(f)
      );
    });
  }, [grupos, filtro, soNaoMapeados]);

  async function vincular(grupo: Grupo, clienteId: string) {
    setAcaoAtiva(grupo.externalId);
    try {
      const res = await fetch("/api/backoffice/grupos-clientes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          groupExternalId: grupo.externalId,
          clienteId,
          instanceId: grupo.instanceId,
          nomeGrupo: grupo.nome,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || `HTTP ${res.status}`);
      }
      await carregar();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erro ao vincular");
    } finally {
      setAcaoAtiva(null);
    }
  }

  async function desvincular(grupo: Grupo) {
    if (!grupo.mapeamentoId) return;
    if (!confirm(`Remover vínculo do grupo "${grupo.nome}" com ${grupo.clienteNome}?`)) return;
    setAcaoAtiva(grupo.externalId);
    try {
      const res = await fetch(`/api/backoffice/grupos-clientes/${grupo.mapeamentoId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || `HTTP ${res.status}`);
      }
      await carregar();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erro ao desvincular");
    } finally {
      setAcaoAtiva(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-[280px]">
          <input
            type="text"
            placeholder="Buscar grupo, cliente ou instância..."
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            className="w-full px-3 py-2 border rounded text-sm"
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={soNaoMapeados}
            onChange={(e) => setSoNaoMapeados(e.target.checked)}
            className="rounded"
          />
          Só não vinculados
        </label>
        <button
          onClick={carregar}
          disabled={carregando}
          className="px-3 py-2 rounded border text-sm hover:bg-muted disabled:opacity-50 flex items-center gap-2"
        >
          {carregando && <Loader2 className="h-3 w-3 animate-spin" />}
          Atualizar
        </button>
      </div>

      {erro && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/30 text-red-700 dark:text-red-400 px-3 py-2 text-sm">
          {erro}
        </div>
      )}

      <div className="rounded-xl border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-3 py-3 font-medium">Grupo</th>
              <th className="text-left px-3 py-3 font-medium">Instância</th>
              <th className="text-left px-3 py-3 font-medium">Última msg</th>
              <th className="text-left px-3 py-3 font-medium w-[36%]">Cliente vinculado</th>
              <th className="text-left px-3 py-3 font-medium w-20">Ação</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.length === 0 && !carregando && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  {grupos === null ? "Carregando..." : "Nenhum grupo encontrado com os filtros atuais."}
                </td>
              </tr>
            )}
            {filtrados.map((g) => (
              <tr key={g.externalId} className="border-t">
                <td className="px-3 py-3">
                  <div className="flex items-center gap-2">
                    <Users className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                    <span className="font-medium">{g.nome}</span>
                  </div>
                </td>
                <td className="px-3 py-3 text-xs text-muted-foreground">{g.instanceNome}</td>
                <td className="px-3 py-3 text-xs text-muted-foreground">
                  {g.lastMessageAt
                    ? new Date(g.lastMessageAt).toLocaleDateString("pt-BR", {
                        day: "2-digit",
                        month: "short",
                      })
                    : "—"}
                </td>
                <td className="px-3 py-3">
                  {g.mapeamentoId ? (
                    <span className="inline-flex items-center gap-1 text-sm">
                      <Link2 className="h-3 w-3 text-emerald-600" />
                      {g.clienteNome}
                      <span className="text-muted-foreground text-xs">({g.clienteConta})</span>
                    </span>
                  ) : (
                    <SeletorCliente
                      clientes={clientes}
                      disabled={acaoAtiva === g.externalId}
                      onSelect={(clienteId) => vincular(g, clienteId)}
                    />
                  )}
                </td>
                <td className="px-3 py-3">
                  {g.mapeamentoId && (
                    <button
                      onClick={() => desvincular(g)}
                      disabled={acaoAtiva === g.externalId}
                      className="text-xs text-red-600 hover:underline disabled:opacity-50"
                      title="Remover vínculo"
                    >
                      {acaoAtiva === g.externalId ? (
                        <Loader2 className="h-3 w-3 animate-spin inline" />
                      ) : (
                        <Unlink className="h-3 w-3 inline" />
                      )}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        {filtrados.length} grupo(s) exibido(s).
        Ao vincular um grupo a um cliente, o sistema passa a atualizar &quot;Último contato&quot; do cliente
        sempre que houver mensagem nova no grupo (cron de 5 em 5 min).
      </p>
    </div>
  );
}

function SeletorCliente({
  clientes,
  disabled,
  onSelect,
}: {
  clientes: Cliente[];
  disabled: boolean;
  onSelect: (clienteId: string) => void;
}) {
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState(false);

  const resultados = useMemo(() => {
    const b = busca.trim().toLowerCase();
    if (!b) return [];
    return clientes
      .filter(
        (c) =>
          c.nome.toLowerCase().includes(b) ||
          c.numeroConta.includes(b),
      )
      .slice(0, 20);
  }, [busca, clientes]);

  return (
    <div className="relative">
      <input
        type="text"
        placeholder="Digite nome ou conta do cliente..."
        value={busca}
        onChange={(e) => {
          setBusca(e.target.value);
          setAberto(true);
        }}
        onFocus={() => setAberto(true)}
        onBlur={() => setTimeout(() => setAberto(false), 200)}
        disabled={disabled}
        className="w-full px-2 py-1 border rounded text-sm disabled:opacity-50"
      />
      {aberto && resultados.length > 0 && (
        <div className="absolute z-10 mt-1 w-full max-h-60 overflow-y-auto bg-popover border rounded shadow-lg">
          {resultados.map((c) => (
            <button
              key={c.id}
              onClick={() => {
                onSelect(c.id);
                setBusca("");
                setAberto(false);
              }}
              className="w-full text-left px-3 py-2 text-xs hover:bg-muted block"
            >
              <span className="font-medium">{c.nome}</span>
              <span className="text-muted-foreground ml-2">
                {c.numeroConta} · {c.assessorNome ?? "sem assessor"}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
