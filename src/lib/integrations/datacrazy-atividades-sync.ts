import "server-only";
import { fetchAtividades, fetchLead, VENDEDORES_CONFIG } from "@/lib/datacrazy";
import { resolverClienteId } from "@/lib/cliente-matching";
import {
  upsertReuniao,
  deleteReuniaoByExternal,
  recomputeAgregadosBatch,
} from "@/lib/reunioes";
import { reunioesParaRemover } from "@/lib/integrations/reunioes-cleanup";
import { prisma } from "@/lib/prisma";

/**
 * Sync de "Atividades" do Datacrazy → ReuniaoCliente (source="datacrazy-atividade").
 *
 * Datacrazy expõe atividades vinculadas a leads. Pra cada atividade do
 * attendant Eduardo na janela [agora-lookback, agora+lookahead]:
 *   1. Busca dados do lead (telefone + e-mail) — round-trip extra por
 *      atividade. Cacheado dentro da run pra evitar N+1 quando o mesmo
 *      lead aparece em várias atividades.
 *   2. Resolve clienteId via telefone (preferido) ou e-mail.
 *   3. Upsert ReuniaoCliente. Eventos sem match continuam no Datacrazy
 *      mas NÃO entram no agregado — log de unmatched fica em BtgSyncLog.erros.
 *
 * Cleanup: atividades que sumiram da janela atual (deletadas no Datacrazy)
 * são removidas — mesma estratégia do Google Cal sync.
 *
 * Default: attendantId do Eduardo. Pode ser sobrescrito.
 */

export interface AtividadesSyncResult {
  atividadesEncontradas: number;
  reunioesUpsert: number;
  reunioesRemovidas: number;
  agregadosRecomputados: number;
  matchTelefone: number;
  matchEmail: number;
  unmatched: number;
  leadsConsultados: number;
  erros: Array<{ etapa: string; motivo: string }>;
}

export async function syncDatacrazyAtividades(opts: {
  token: string;
  attendantId?: string;
  lookaheadDias?: number;
  lookbackDias?: number;
}): Promise<AtividadesSyncResult> {
  const attendantId =
    opts.attendantId ?? VENDEDORES_CONFIG["Eduardo Campos"].attendantId;
  const lookaheadDias = opts.lookaheadDias ?? 60;
  const lookbackDias = opts.lookbackDias ?? 30;

  const agora = new Date();
  const startDateGte = new Date(agora.getTime() - lookbackDias * 24 * 60 * 60 * 1000);
  const startDateLte = new Date(agora.getTime() + lookaheadDias * 24 * 60 * 60 * 1000);

  const erros: Array<{ etapa: string; motivo: string }> = [];

  // ── Listar atividades
  // `fetchOk` guarda APENAS a listagem (fetchAtividades) — é ela que monta
  // `externalIdsVistos`. Se falhar, o cleanup deletaria atividades válidas
  // (mesmo bug do google-calendar-clientes-sync). Falhas de fetchLead são
  // por-atividade e não corrompem o set (o id já foi visto antes).
  let atividades: Awaited<ReturnType<typeof fetchAtividades>> = [];
  let fetchOk = true;
  try {
    atividades = await fetchAtividades({
      token: opts.token,
      attendantId,
      startDateGte,
      startDateLte,
    });
  } catch (e) {
    fetchOk = false;
    erros.push({
      etapa: "fetchAtividades",
      motivo: e instanceof Error ? e.message : "?",
    });
  }

  // ── Resolver leadId → clienteId (cache dentro da run)
  const leadCache = new Map<string, { clienteId: string | null; via: "telefone" | "email" | null }>();
  let leadsConsultados = 0;
  let matchTelefone = 0;
  let matchEmail = 0;
  let unmatched = 0;

  async function resolverLead(leadId: string): Promise<{ clienteId: string | null; via: "telefone" | "email" | null }> {
    if (leadCache.has(leadId)) return leadCache.get(leadId)!;
    let result: { clienteId: string | null; via: "telefone" | "email" | null } = {
      clienteId: null,
      via: null,
    };
    try {
      const lead = await fetchLead(leadId, opts.token);
      leadsConsultados++;
      if (lead) {
        const match = await resolverClienteId({
          telefone: lead.phone,
          email: lead.email,
        });
        if (match) result = { clienteId: match.clienteId, via: match.via };
      }
    } catch (e) {
      erros.push({
        etapa: `fetchLead ${leadId}`,
        motivo: e instanceof Error ? e.message : "?",
      });
    }
    leadCache.set(leadId, result);
    return result;
  }

  // ── Upsert
  const clientesAfetados = new Set<string>();
  const externalIdsVistos = new Set<string>();
  let reunioesUpsert = 0;

  for (const a of atividades) {
    if (!a.id) continue;
    externalIdsVistos.add(a.id);
    if (!a.leadId) {
      unmatched++;
      continue;
    }

    const { clienteId, via } = await resolverLead(a.leadId);
    if (!clienteId || !via) {
      unmatched++;
      erros.push({
        etapa: `match ${a.id}`,
        motivo: `lead ${a.leadId} (${a.leadName ?? "?"}) não casou com nenhum cliente`,
      });
      continue;
    }

    try {
      const r = await upsertReuniao({
        clienteId,
        source: "datacrazy-atividade",
        externalId: a.id,
        startAt: a.startDate,
        endAt: a.endDate,
        titulo: a.title,
        matchedVia: via, // "telefone" | "email"
        rawPayload: a.rawPayload,
      });
      if (r !== "noop") {
        reunioesUpsert++;
        clientesAfetados.add(clienteId);
      }
      if (via === "telefone") matchTelefone++;
      else if (via === "email") matchEmail++;
    } catch (e) {
      erros.push({
        etapa: `upsert ${a.id}`,
        motivo: e instanceof Error ? e.message : "?",
      });
    }
  }

  // ── Cleanup: atividades que sumiram da janela atual — só sobre fetch que
  // teve sucesso real (ver fetchOk acima).
  let reunioesRemovidas = 0;
  if (!fetchOk) {
    erros.push({
      etapa: "cleanup",
      motivo:
        "pulado — fetchAtividades falhou; cleanup não roda sobre fetch incompleto (evita deleção em massa)",
    });
  } else {
    const candidatas = await prisma.reuniaoCliente.findMany({
      where: {
        source: "datacrazy-atividade",
        startAt: { gte: startDateGte, lte: startDateLte },
      },
      select: { id: true, clienteId: true, externalId: true },
    });
    const removerIds = reunioesParaRemover(fetchOk, candidatas, externalIdsVistos);

    if (removerIds.length > 0) {
      const r = await prisma.reuniaoCliente.deleteMany({
        where: { id: { in: removerIds.map((x) => x.id) } },
      });
      reunioesRemovidas = r.count;
      for (const x of removerIds) clientesAfetados.add(x.clienteId);
    }
  }

  // ── Recomputar agregados
  const recompute = await recomputeAgregadosBatch(Array.from(clientesAfetados));

  return {
    atividadesEncontradas: atividades.length,
    reunioesUpsert,
    reunioesRemovidas,
    agregadosRecomputados: recompute.atualizados,
    matchTelefone,
    matchEmail,
    unmatched,
    leadsConsultados,
    erros,
  };
}

export { deleteReuniaoByExternal };
