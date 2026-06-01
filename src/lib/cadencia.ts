import "server-only";
import { prisma } from "@/lib/prisma";
import { DIAS_POR_CLASSE, DIAS_CLASSE_PADRAO, diasCadencia } from "@/lib/cadencia-core";

/**
 * Cadência Supernova ABC — régua de contato (lado server).
 *
 * A régua (DIAS_POR_CLASSE A=30/B=90/C=180) e o termômetro de presença vivem
 * em `cadencia-core.ts` (puro, importável no client). Aqui ficam só os helpers
 * que tocam o banco. Re-exporta as constantes pra não quebrar imports antigos.
 */
export { DIAS_POR_CLASSE, DIAS_CLASSE_PADRAO, diasCadencia };
export { statusTermometro } from "@/lib/cadencia-core";
export type { StatusTermometro, TermometroPresenca } from "@/lib/cadencia-core";

const MS_DIA = 24 * 60 * 60 * 1000;

/**
 * Próximo contato a partir de uma data-âncora (default: agora).
 * O fluxo manual ancora em "agora" (registrou contato → próximo daqui a X).
 * O backfill ancora em `ultimoContatoAt` quando existe, pra refletir
 * corretamente quem já está atrasado.
 */
export function proximoContatoPor(
  classificacao: string,
  desde: Date = new Date(),
): Date {
  return new Date(desde.getTime() + diasCadencia(classificacao) * MS_DIA);
}

/**
 * Backfill idempotente de `proximoContatoAt`.
 *
 * Para todo cliente SEM `proximoContatoAt`, calcula a próxima data pela
 * classificação (mesma régua de `proximoContatoPor`), ancorada em
 * `ultimoContatoAt` quando existe (senão `now()`). Roda em UM UPDATE com
 * CASE — eficiente mesmo com milhares de clientes.
 *
 * Idempotente: o filtro `proximoContatoAt IS NULL` garante que clientes
 * já semeados nunca são tocados. Seguro pra rodar em loop / cron diário.
 */
export async function backfillProximoContato(): Promise<{ atualizados: number }> {
  // CASE derivado de DIAS_POR_CLASSE → fonte única de verdade.
  const casos = Object.entries(DIAS_POR_CLASSE)
    .map(([classe, dias]) => `WHEN '${classe}' THEN ${dias}`)
    .join(" ");

  const sql = `
    UPDATE "ClienteBackoffice"
    SET "proximoContatoAt" = COALESCE("ultimoContatoAt", now())
      + ((CASE classificacao ${casos} ELSE ${DIAS_CLASSE_PADRAO} END) || ' days')::interval
    WHERE "proximoContatoAt" IS NULL
  `;

  const atualizados = await prisma.$executeRawUnsafe(sql);
  return { atualizados };
}
