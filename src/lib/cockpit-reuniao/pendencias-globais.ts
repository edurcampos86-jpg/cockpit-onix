/**
 * Leitura GLOBAL de pendências de reunião abertas (Tarefas pós-reunião · T2).
 * Camada PURA e testável: recebe as reuniões estruturadas (de VÁRIOS clientes,
 * já escopadas por RBAC no server) e produz a lista de pendências abertas
 * agrupada por cliente, sinalizando as atrasadas. Sem Prisma, sem React.
 *
 * Reusa `parsePendencias` (mesmo parsing defensivo do por-cliente) — o índice
 * casa com o array canônico, então uma futura ação (marcar/rotear) a partir
 * desta tela é consistente com a do Cockpit de Reunião.
 */

import { parsePendencias } from "./derivar";

/** Uma reunião estruturada com o cliente dono, como o server serializa. */
export type PendenciaGlobalInput = {
  reuniaoId: string;
  data: string; // ISO da reunião
  dataRetorno: string | null; // ISO; prazo de retorno (nível reunião)
  clienteId: string;
  clienteNome: string;
  pendencias: unknown;
};

/** Uma pendência aberta, com identidade p/ acionar e o cliente de origem. */
export type PendenciaAberta = {
  reuniaoId: string;
  clienteId: string;
  clienteNome: string;
  lado: "assessor" | "cliente";
  indice: number;
  texto: string;
  reuniaoData: string;
  dataRetorno: string | null;
  atrasada: boolean; // dataRetorno já passou?
};

export type GrupoCliente = {
  clienteId: string;
  clienteNome: string;
  abertas: number;
  atrasadas: number;
  itens: PendenciaAberta[];
};

export type PendenciasGlobais = {
  grupos: GrupoCliente[];
  totalAbertas: number;
  totalAtrasadas: number;
  totalClientes: number;
};

/** yyyy-mm-dd de um ISO (comparação lexical = cronológica, sem fuso). */
function ymd(iso: string): string {
  return iso.slice(0, 10);
}

/**
 * Deriva a visão global. `hojeISO` é injetado (testabilidade). Uma pendência é
 * `atrasada` quando a reunião tem `dataRetorno` e ele já passou (< hoje).
 */
export function derivarPendenciasGlobais(
  reunioes: PendenciaGlobalInput[],
  hojeISO: string,
): PendenciasGlobais {
  const hoje = ymd(hojeISO);
  const itens: PendenciaAberta[] = [];

  for (const r of reunioes) {
    const pend = parsePendencias(r.pendencias);
    const atrasada = r.dataRetorno != null && ymd(r.dataRetorno) < hoje;
    const coletar = (lado: "assessor" | "cliente", arr: { concluido: boolean; texto: string }[]) => {
      arr.forEach((it, indice) => {
        if (it.concluido) return;
        itens.push({
          reuniaoId: r.reuniaoId,
          clienteId: r.clienteId,
          clienteNome: r.clienteNome,
          lado,
          indice,
          texto: it.texto,
          reuniaoData: r.data,
          dataRetorno: r.dataRetorno,
          atrasada,
        });
      });
    };
    coletar("assessor", pend.assessor);
    coletar("cliente", pend.cliente);
  }

  const mapa = new Map<string, GrupoCliente & { _maxData: string }>();
  for (const it of itens) {
    let g = mapa.get(it.clienteId);
    if (!g) {
      g = { clienteId: it.clienteId, clienteNome: it.clienteNome, abertas: 0, atrasadas: 0, itens: [], _maxData: "" };
      mapa.set(it.clienteId, g);
    }
    g.itens.push(it);
    g.abertas += 1;
    if (it.atrasada) g.atrasadas += 1;
    if (it.reuniaoData > g._maxData) g._maxData = it.reuniaoData;
  }

  const ordenados = [...mapa.values()].sort(
    (a, b) =>
      b.atrasadas - a.atrasadas ||
      b._maxData.localeCompare(a._maxData) ||
      a.clienteNome.localeCompare(b.clienteNome),
  );
  const grupos: GrupoCliente[] = ordenados.map((g) => ({
    clienteId: g.clienteId,
    clienteNome: g.clienteNome,
    abertas: g.abertas,
    atrasadas: g.atrasadas,
    itens: g.itens.slice().sort((x, y) => y.reuniaoData.localeCompare(x.reuniaoData)),
  }));

  return {
    grupos,
    totalAbertas: itens.length,
    totalAtrasadas: itens.filter((i) => i.atrasada).length,
    totalClientes: grupos.length,
  };
}
