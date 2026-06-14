import "server-only";
import { prisma } from "@/lib/prisma";
import { getConfig } from "@/lib/config-db";
import {
  classificarEstadoAtencao,
  type EstadoAtencao,
} from "@/lib/painel-atencao/core";

/**
 * Painel de Atenção ao Cliente — service (server-only, com prisma).
 *
 * Deriva, por cliente da carteira de UM assessor, as 2 datas direcionais
 * (eu↔cliente) a partir de `Mensagem.sentAt` por `fromMe` via `Conversa
 * .clienteId`, e classifica o estado de atenção reusando o núcleo puro
 * (`core.ts`) + o motor de cadência (`cadencia-core`).
 *
 * Decisão F2: runtime, SEM materializar as datas em coluna e SEM índice novo —
 * a agregação é escopada à carteira de 1 assessor (N pequeno), então é barata.
 */

/** Chave Config DB do gate do backend (default OFF). */
export const PAINEL_ATENCAO_FLAG = "PAINEL_ATENCAO_BACKEND";
/** Chave Config DB do TETO de vácuo (default desligado — vale a cadência pura). */
export const LIMIAR_VACUO_DIAS_KEY = "LIMIAR_VACUO_DIAS";
// Default alto o bastante pra NÃO limitar: o vácuo é tier-aware (gap >= cadência
// A30/B90/C180) e o limiar só age como TETO opcional via min(limiar, cadência).
// 3650 (10 anos) >> maior cadência (C=180), então por padrão a cadência manda.
const LIMIAR_VACUO_DIAS_PADRAO = 3650;

function parseBoolFlag(v: string | undefined): boolean {
  if (!v) return false;
  return ["1", "true", "on", "yes", "sim"].includes(v.trim().toLowerCase());
}

/** Backend habilitado? Lê a flag do Config DB a cada chamada. Default OFF. */
export async function painelAtencaoBackendHabilitado(): Promise<boolean> {
  return parseBoolFlag(await getConfig(PAINEL_ATENCAO_FLAG));
}

/** Teto de vácuo (cap) tunável sem deploy (Config DB). Default desligado (cadência pura). */
export async function resolverLimiarVacuoDias(): Promise<number> {
  const raw = await getConfig(LIMIAR_VACUO_DIAS_KEY);
  const n = raw == null ? NaN : Number(raw);
  return Number.isFinite(n) && n > 0 ? n : LIMIAR_VACUO_DIAS_PADRAO;
}

export interface ClienteAtencao {
  id: string;
  nome: string;
  tier: string; // "A" | "B" | "C"
  estado: EstadoAtencao;
  ultimoEuFalei: string | null; // ISO
  ultimoClienteFalou: string | null; // ISO
  diasDesdeQualquerContato: number | null;
  diasNoVacuo: number | null;
}

export interface PainelAtencao {
  assessorId: string;
  /**
   * ≥1 cliente da carteira tem QUALQUER mensagem ingerida. Quando false, NÃO
   * pintar todo mundo como esquecido/sem-contato (seria falso) — o consumidor
   * mostra "assessor não conectado" em vez dos estados por cliente.
   */
  assessorPlugado: boolean;
  limiarVacuoDias: number;
  geradoEm: string; // ISO
  totais: Record<EstadoAtencao, number>;
  clientes: ClienteAtencao[];
}

function totaisZerados(): Record<EstadoAtencao, number> {
  return { "em-dia": 0, "no-vacuo": 0, esquecido: 0, "sem-contato": 0 };
}

/**
 * Carteira do assessor (`assessorCge = assessorId`, campo indexado) com, por
 * cliente: as 2 datas direcionais, o tier ABC e o estado de atenção.
 */
export async function getPainelAtencao(
  assessorId: string,
): Promise<PainelAtencao> {
  const now = Date.now();
  const limiarVacuoDias = await resolverLimiarVacuoDias();
  const totais = totaisZerados();

  // 1. Carteira do assessor (scoping por assessorCge, indexado).
  const clientes = await prisma.clienteBackoffice.findMany({
    where: { assessorCge: assessorId },
    select: { id: true, nome: true, classificacao: true },
  });

  if (clientes.length === 0) {
    return {
      assessorId,
      assessorPlugado: false,
      limiarVacuoDias,
      geradoEm: new Date(now).toISOString(),
      totais,
      clientes: [],
    };
  }

  // 2. Conversas da carteira → mapa conversaId → clienteId.
  const ids = clientes.map((c) => c.id);
  const conversas = await prisma.conversa.findMany({
    where: { clienteId: { in: ids } },
    select: { id: true, clienteId: true },
  });
  const conversaToCliente = new Map<string, string>();
  for (const cv of conversas) {
    if (cv.clienteId) conversaToCliente.set(cv.id, cv.clienteId);
  }

  // 3. As 2 datas direcionais: MAX(sentAt) por (conversa, fromMe), dobrado
  //    em (cliente, fromMe). Sem raw SQL — groupBy tipado.
  const datas = new Map<string, { eu: number | null; cliente: number | null }>();
  if (conversas.length > 0) {
    const grupos = await prisma.mensagem.groupBy({
      by: ["conversaId", "fromMe"],
      where: { conversaId: { in: conversas.map((c) => c.id) } },
      _max: { sentAt: true },
    });
    for (const g of grupos) {
      const clienteId = conversaToCliente.get(g.conversaId);
      const t = g._max.sentAt ? g._max.sentAt.getTime() : null;
      if (!clienteId || t == null) continue;
      const acc = datas.get(clienteId) ?? { eu: null, cliente: null };
      if (g.fromMe) acc.eu = Math.max(acc.eu ?? 0, t);
      else acc.cliente = Math.max(acc.cliente ?? 0, t);
      datas.set(clienteId, acc);
    }
  }

  // 4. Classifica cada cliente da carteira reusando o núcleo puro.
  let comMensagem = 0;
  const out: ClienteAtencao[] = clientes.map((c) => {
    const d = datas.get(c.id);
    const ultimoEuFalei = d?.eu != null ? new Date(d.eu) : null;
    const ultimoClienteFalou = d?.cliente != null ? new Date(d.cliente) : null;
    if (ultimoEuFalei || ultimoClienteFalou) comMensagem++;

    const r = classificarEstadoAtencao({
      ultimoEuFalei,
      ultimoClienteFalou,
      classificacao: c.classificacao,
      limiarVacuoDias,
      now,
    });
    totais[r.estado]++;

    return {
      id: c.id,
      nome: c.nome,
      tier: r.tier,
      estado: r.estado,
      ultimoEuFalei: ultimoEuFalei ? ultimoEuFalei.toISOString() : null,
      ultimoClienteFalou: ultimoClienteFalou
        ? ultimoClienteFalou.toISOString()
        : null,
      diasDesdeQualquerContato: r.diasDesdeQualquerContato,
      diasNoVacuo: r.diasNoVacuo,
    };
  });

  return {
    assessorId,
    assessorPlugado: comMensagem > 0,
    limiarVacuoDias,
    geradoEm: new Date(now).toISOString(),
    totais,
    clientes: out,
  };
}
