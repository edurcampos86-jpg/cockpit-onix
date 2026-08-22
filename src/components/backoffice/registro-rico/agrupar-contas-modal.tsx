"use client";

import { useState } from "react";
import { Loader2, Users, X } from "lucide-react";

/**
 * Cria um grupo de atendimento a partir de contas escolhidas.
 *
 * O grupo é uma DECISÃO, não um dado derivado: contas sem CPF em comum e sem
 * grupo de WhatsApp podem ser atendidas juntas, e só quem atende sabe disso.
 * Por isso a tela não sugere agrupamento automático — o sistema já erra o
 * suficiente inferindo parentesco por sobrenome.
 *
 * A coluna "recebe contato" é a razão de o modal existir e fica visível na
 * própria lista: marcar o grupo e esquecer que o filho não queria receber
 * propagação é o erro que some no silêncio, porque o efeito dele é um cliente
 * parecer atendido sem nunca ter sido.
 */

export type ContaCandidata = {
  id: string;
  nome: string;
  numeroConta: string;
  classificacao?: string;
};

export function AgruparContasModal({
  contas,
  aberto,
  onFechar,
  onCriado,
}: {
  contas: readonly ContaCandidata[];
  aberto: boolean;
  onFechar: () => void;
  onCriado?: (grupo: { id: string; nome: string }) => void;
}) {
  const [nome, setNome] = useState("");
  const [selecionadas, setSelecionadas] = useState<Record<string, boolean>>({});
  const [viaGrupo, setViaGrupo] = useState<Record<string, boolean>>({});
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  if (!aberto) return null;

  const escolhidas = contas.filter((c) => selecionadas[c.id]);
  const quantosRecebem = escolhidas.filter((c) => viaGrupo[c.id] !== false).length;

  async function criar() {
    setSalvando(true);
    setErro(null);
    try {
      const res = await fetch("/api/backoffice/clientes/grupos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: nome.trim(),
          membros: escolhidas.map((c) => ({
            clienteId: c.id,
            viaGrupo: viaGrupo[c.id] !== false,
          })),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErro(json.error ?? "Não foi possível criar o grupo");
        return;
      }
      onCriado?.({ id: json.id, nome: json.nome });
      onFechar();
    } catch {
      setErro("Falha de rede. Tente de novo.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-lg border border-border bg-card p-5 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="flex items-center gap-2 font-semibold">
              <Users className="h-4 w-4" aria-hidden /> Agrupar contas
            </h2>
            <p className="text-xs text-muted-foreground">
              Contas atendidas juntas. Contato registrado no grupo passa a valer para quem estiver
              marcado abaixo.
            </p>
          </div>
          <button type="button" onClick={onFechar} aria-label="Fechar">
            <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
          </button>
        </div>

        <div className="space-y-1">
          <label htmlFor="nome-grupo" className="text-xs font-medium text-muted-foreground">
            Nome do grupo
          </label>
          <input
            id="nome-grupo"
            type="text"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="ex.: Família Lisboa"
            className="w-full rounded border border-border bg-background px-2 py-1 text-sm"
          />
        </div>

        <div className="max-h-64 overflow-y-auto rounded border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="p-2 text-left font-medium">Conta</th>
                <th className="p-2 text-center font-medium">No grupo</th>
                <th className="p-2 text-center font-medium">Recebe contato</th>
              </tr>
            </thead>
            <tbody>
              {contas.map((c) => {
                const dentro = !!selecionadas[c.id];
                return (
                  <tr key={c.id} className="border-t border-border">
                    <td className="p-2">
                      <span className="font-medium">{c.nome}</span>
                      <span className="ml-2 text-xs text-muted-foreground">{c.numeroConta}</span>
                    </td>
                    <td className="p-2 text-center">
                      <input
                        type="checkbox"
                        checked={dentro}
                        aria-label={`Incluir ${c.nome} no grupo`}
                        onChange={(e) =>
                          setSelecionadas({ ...selecionadas, [c.id]: e.target.checked })
                        }
                      />
                    </td>
                    <td className="p-2 text-center">
                      <input
                        type="checkbox"
                        // Default marcado: quem monta um grupo está dizendo que
                        // falar com um é falar com todos. Desmarcar é a exceção
                        // declarada, e precisa de um clique deliberado.
                        checked={dentro && viaGrupo[c.id] !== false}
                        disabled={!dentro}
                        aria-label={`${c.nome} recebe contato do grupo`}
                        onChange={(e) => setViaGrupo({ ...viaGrupo, [c.id]: e.target.checked })}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-muted-foreground">
          {escolhidas.length === 0
            ? "Nenhuma conta escolhida."
            : `${escolhidas.length} ${escolhidas.length === 1 ? "conta no grupo" : "contas no grupo"} · ${quantosRecebem} ${quantosRecebem === 1 ? "recebe" : "recebem"} contato do grupo.`}
        </p>

        {erro && <p className="text-xs text-destructive">{erro}</p>}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onFechar}
            className="rounded px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={criar}
            disabled={salvando || !nome.trim() || escolhidas.length === 0}
            className="inline-flex items-center gap-1 rounded bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {salvando && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
            Criar grupo
          </button>
        </div>
      </div>
    </div>
  );
}
