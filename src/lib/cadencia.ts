import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Cadência Supernova ABC — fonte única da régua de contato.
 *
 * 12-4-2 = toques/ano por classe:
 *   A = 12 toques/ano  → ~mensal   → 30 dias entre contatos
 *   B = 6 toques/ano   → ~bimestral → 60 dias
 *   C = 2 toques/ano   → ~semestral → 180 dias
 *
 * Mantém a MESMA régua que o fluxo manual de registro de interação
 * (`proximoContatoPor`), pra Cadência e backfill nunca divergirem.
 */
export const DIAS_POR_CLASSE: Record<string, number> = {
  A: 30,
  B: 60,
  C: 180,
};

export const DIAS_CLASSE_PADRAO = 180; // fallback p/ classificação desconhecida

export function diasCadencia(classificacao: string | null | undefined): number {
  return DIAS_POR_CLASSE[(classificacao || "").toUpperCase()] ?? DIAS_CLASSE_PADRAO;
}

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
