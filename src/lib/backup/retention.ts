import "server-only";
import { listBackups, deleteBackup } from "../b2/backup";

/**
 * Política de retenção tier (GFS — Grandfather/Father/Son):
 *  - Daily:   últimos N dias (cada um)
 *  - Monthly: o mais recente de cada mês, últimos M meses
 *  - Yearly:  o mais recente de cada ano, últimos Y anos
 *
 * Qualquer arquivo que não casa em nenhuma das categorias é deletado.
 *
 * Defaults vêm de env vars:
 *  BACKUP_RETENTION_DAYS    (default 30)
 *  BACKUP_RETENTION_MONTHLY (default 12)
 *  BACKUP_RETENTION_YEARLY  (default 5)
 */

type BackupItem = {
  key: string;
  size: number;
  lastModified: Date;
};

export type RetentionPlan = {
  prefix: string;
  manter: string[]; // keys que vão ficar
  remover: string[]; // keys que vão sair
};

export async function planoRetencao(prefix: string): Promise<RetentionPlan> {
  const itens = await listBackups(prefix);
  // ordem desc por lastModified (mais novo primeiro)
  itens.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());

  const daysKeep = num("BACKUP_RETENTION_DAYS", 30);
  const monthsKeep = num("BACKUP_RETENTION_MONTHLY", 12);
  const yearsKeep = num("BACKUP_RETENTION_YEARLY", 5);

  const manter = new Set<string>();

  // Daily: primeiros N (mais novos)
  const daily = itens.slice(0, daysKeep);
  daily.forEach((i) => manter.add(i.key));

  // Monthly: mais recente de cada mês, M meses
  const porMes = agruparPor(itens, (d) => `${d.getUTCFullYear()}-${d.getUTCMonth()}`);
  Object.values(porMes)
    .map((grupo) => grupo[0]) // já ordenado desc, então grupo[0] é o mais novo do mês
    .slice(0, monthsKeep)
    .forEach((i) => manter.add(i.key));

  // Yearly: mais recente de cada ano, Y anos
  const porAno = agruparPor(itens, (d) => `${d.getUTCFullYear()}`);
  Object.values(porAno)
    .map((grupo) => grupo[0])
    .slice(0, yearsKeep)
    .forEach((i) => manter.add(i.key));

  const remover = itens.filter((i) => !manter.has(i.key)).map((i) => i.key);

  return {
    prefix,
    manter: Array.from(manter),
    remover,
  };
}

export async function aplicarRetencao(prefix: string): Promise<{
  removidos: number;
  mantidos: number;
  erros: number;
}> {
  const plano = await planoRetencao(prefix);
  let erros = 0;
  for (const key of plano.remover) {
    try {
      await deleteBackup(key);
    } catch (e) {
      console.error(`[retencao] falhou ao deletar ${key}:`, e);
      erros++;
    }
  }
  return {
    removidos: plano.remover.length - erros,
    mantidos: plano.manter.length,
    erros,
  };
}

function agruparPor(itens: BackupItem[], chave: (d: Date) => string): Record<string, BackupItem[]> {
  return itens.reduce<Record<string, BackupItem[]>>((acc, item) => {
    const k = chave(item.lastModified);
    (acc[k] ||= []).push(item);
    return acc;
  }, {});
}

function num(envKey: string, fallback: number): number {
  const raw = process.env[envKey];
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
