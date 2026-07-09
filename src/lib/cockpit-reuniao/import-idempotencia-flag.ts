import { getConfig } from "@/lib/config-db";

/**
 * Gate (Config DB) da idempotência do import de reunião (Tarefas pós-reunião ·
 * T2.5b). Flag PRÓPRIA, default OFF — muda o write-path do import, então entra
 * com rollback fácil.
 *
 * OFF → comportamento de hoje: todo import cria um `ReuniaoEstruturada` novo.
 * ON  → reimportar a MESMA reunião (clienteId + data) ATUALIZA o registro
 *       existente em vez de duplicar (e o resultado sinaliza `atualizado`).
 *
 * Ativar: `IMPORT_REUNIAO_IDEMPOTENTE=1` no `.env.local`, ou linha na tabela
 * Config: INSERT INTO "Config" (key,value) VALUES ('IMPORT_REUNIAO_IDEMPOTENTE','1').
 */
export const IMPORT_REUNIAO_IDEMPOTENTE_FLAG = "IMPORT_REUNIAO_IDEMPOTENTE";

function parseBoolFlag(v: string | undefined): boolean {
  if (!v) return false;
  return ["1", "true", "on", "yes", "sim"].includes(v.trim().toLowerCase());
}

/** Import idempotente habilitado? Lê a flag do Config DB. Default OFF. */
export async function importReuniaoIdempotenteHabilitado(): Promise<boolean> {
  return parseBoolFlag(await getConfig(IMPORT_REUNIAO_IDEMPOTENTE_FLAG));
}
