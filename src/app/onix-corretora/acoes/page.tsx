"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { ComoFunciona } from "@/components/layout/como-funciona";
import { CheckSquare, Circle } from "lucide-react";

type Acao = {
  id: string;
  vendedor: string;
  numero: number;
  titulo: string;
  descricao: string;
  concluida: boolean;
  concluidaEm: string | null;
  relatorio: { periodo: string; periodoInicio: string };
};

const VENDEDORES = ["Todos", "Eduardo Campos", "Thiago Vergal", "Rose Oliveira"];

function AcoesContent() {
  const searchParams = useSearchParams();
  const vendedorParam = searchParams.get("vendedor");
  const relatorioIdParam = searchParams.get("relatorioId");

  const [acoes, setAcoes] = useState<Acao[]>([]);
  const [filtroVendedor, setFiltroVendedor] = useState(vendedorParam ?? "Todos");
  const [loading, setLoading] = useState(true);
  const [atualizando, setAtualizando] = useState<string | null>(null);

  const fetchAcoes = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filtroVendedor !== "Todos") params.set("vendedor", filtroVendedor);
    if (relatorioIdParam) params.set("relatorioId", relatorioIdParam);
    const res = await fetch(`/api/onix-corretora/acoes?${params}`);
    const data = await res.json();
    setAcoes(data);
    setLoading(false);
  }, [filtroVendedor, relatorioIdParam]);

  useEffect(() => {
    fetchAcoes();
  }, [fetchAcoes]);

  async function toggleAcao(id: string, concluida: boolean) {
    setAtualizando(id);
    await fetch("/api/onix-corretora/acoes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, concluida: !concluida }),
    });
    setAcoes((prev) =>
      prev.map((a) =>
        a.id === id ? { ...a, concluida: !concluida, concluidaEm: !concluida ? new Date().toISOString() : null } : a
      )
    );
    setAtualizando(null);
  }

  // Agrupar por relatorio
  const grupos: Record<string, { periodo: string; vendedor: string; acoes: Acao[] }> = {};
  for (const a of acoes) {
    const key = `${a.relatorio.periodo}__${a.vendedor}`;
    if (!grupos[key]) {
      grupos[key] = { periodo: a.relatorio.periodo, vendedor: a.vendedor, acoes: [] };
    }
    grupos[key].acoes.push(a);
  }

  const totalAcoes = acoes.length;
  const concluidas = acoes.filter((a) => a.concluida).length;
  const pendentes = totalAcoes - concluidas;

  return (
    <div className="min-h-screen">
      <PageHeader
        title="Plano de Acao"
        description={
          totalAcoes > 0
            ? `${concluidas} concluidas, ${pendentes} pendentes`
            : "Checklist de acoes semanais por vendedor"
        }
      />

      <div className="p-8 space-y-6">
        <ComoFunciona
          proposito="Lista única de todas as ações que cada vendedor precisa executar na semana — extraídas dos relatórios de análise comercial."
          comoUsar="Filtre por vendedor, marque cada ação como concluída ao executar. Use isso como sua agenda semanal de coaching com o time."
          comoAjuda="Transforma os insights dos relatórios em movimento real. Sem essa página, as recomendações ficariam só no papel."
        />

        {/* Filtro vendedor */}
        {!relatorioIdParam && (
          <div className="flex flex-wrap gap-2">
            {VENDEDORES.map((v) => (
              <button
                key={v}
                onClick={() => setFiltroVendedor(v)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  filtroVendedor === v
                    ? "bg-primary text-primary-foreground"
                    : "bg-sidebar-accent text-muted-foreground hover:text-foreground"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <div className="py-20 text-center text-muted-foreground">Carregando...</div>
        ) : Object.keys(grupos).length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-12 text-center">
            <CheckSquare className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Nenhuma acao encontrada</h3>
            <p className="text-sm text-muted-foreground">
              As acoes aparecem aqui apos o relatorio semanal ser gerado.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(grupos).map(([key, grupo]) => {
              const totalGrupo = grupo.acoes.length;
              const concluidasGrupo = grupo.acoes.filter((a) => a.concluida).length;
              const pct = totalGrupo > 0 ? Math.round((concluidasGrupo / totalGrupo) * 100) : 0;

              return (
                <div key={key} className="rounded-xl border border-border bg-card overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                    <div>
                      <span className="inline-flex items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold px-2.5 py-0.5 mr-2">
                        {grupo.vendedor.split(" ")[0]}
                      </span>
                      <span className="text-sm font-semibold">{grupo.periodo}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-24 rounded-full bg-sidebar-accent overflow-hidden">
                          <div
                            className="h-full rounded-full bg-primary transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground">{concluidasGrupo}/{totalGrupo}</span>
                      </div>
                    </div>
                  </div>
                  <div className="divide-y divide-border">
                    {grupo.acoes.map((acao) => (
                      <div key={acao.id} className="flex gap-4 px-5 py-4">
                        <button
                          onClick={() => toggleAcao(acao.id, acao.concluida)}
                          disabled={atualizando === acao.id}
                          className="mt-0.5 shrink-0 transition-opacity disabled:opacity-50"
                        >
                          {acao.concluida ? (
                            <CheckSquare className="h-5 w-5 text-green-400" />
                          ) : (
                            <Circle className="h-5 w-5 text-muted-foreground hover:text-primary transition-colors" />
                          )}
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-medium ${acao.concluida ? "line-through text-muted-foreground" : ""}`}>
                            {acao.numero}. {acao.titulo}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{acao.descricao}</p>
                          {acao.concluida && acao.concluidaEm && (
                            <p className="text-[11px] text-green-400/70 mt-1">
                              Concluida em {new Date(acao.concluidaEm).toLocaleDateString("pt-BR")}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default function AcoesPage() {
  return (
    <Suspense fallback={<div className="p-8 text-muted-foreground">Carregando...</div>}>
      <AcoesContent />
    </Suspense>
  );
}
