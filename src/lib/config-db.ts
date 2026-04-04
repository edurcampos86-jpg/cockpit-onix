/**
 * DB-based config fallback.
 *
 * Railway injects most env vars correctly, but DATACRAZY_TOKEN consistently
 * fails to appear in process.env inside the container despite being stored in
 * Railway's variable system. This module reads from the `Config` table in
 * Postgres as a reliable fallback — DATABASE_URL always works.
 *
 * Usage:
 *   const token = await getConfig("DATACRAZY_TOKEN");
 */

import { prisma } from "@/lib/prisma";

/**
 * Returns process.env[key] if set, otherwise reads from Config table in DB.
 */
export async function getConfig(key: string): Promise<string | undefined> {
  const envVal = process.env[key];
  if (envVal) return envVal;

  try {
    const row = await prisma.config.findUnique({ where: { key } });
    return row?.value ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Saves a value to the Config table in DB.
 */
export async function setConfig(key: string, value: string): Promise<void> {
  await prisma.config.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
}
