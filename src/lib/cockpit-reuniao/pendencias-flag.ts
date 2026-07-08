import { getConfig } from "@/lib/config-db";

/**
 * Gate (Config DB) da tela GLOBAL de pendências de reunião abertas (Tarefas
 * pós-reunião · T2). Flag PRÓPRIA, default OFF — espelha `cockpitReuniaoHabilitado`.
 *
 * OFF → a rota /empresas/investimentos/pendencias responde notFound() (não
 *       existe superfície nova).
 * ON  → a tela lista as pendências abertas de todos os clientes VISÍVEIS
 *       (escopo RBAC aplicado no server).
 *
 * Ativar: `PENDENCIAS_ABERTAS=1` no `.env.local`, ou linha na tabela Config:
 * INSERT INTO "Config" (key,value) VALUES ('PENDENCIAS_ABERTAS','1').
 */
export const PENDENCIAS_ABERTAS_FLAG = "PENDENCIAS_ABERTAS";

function parseBoolFlag(v: string | undefined): boolean {
  if (!v) return false;
  return ["1", "true", "on", "yes", "sim"].includes(v.trim().toLowerCase());
}

/** Tela de pendências abertas habilitada? Lê a flag do Config DB. Default OFF. */
export async function pendenciasAbertasHabilitado(): Promise<boolean> {
  return parseBoolFlag(await getConfig(PENDENCIAS_ABERTAS_FLAG));
}
