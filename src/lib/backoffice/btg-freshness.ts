import "server-only";
import { prisma } from "@/lib/prisma";
import { getConfig } from "@/lib/config-db";
import { sendSlackMessage } from "@/lib/integrations/slack";
import type { FonteImport } from "./field-source-policy";

/**
 * Heartbeat de freshness dos dados BTG.
 *
 * Mede o frescor por FONTE a partir de `fonteUltimoUpdate` (Json por cliente,
 * `{ campo: "fonte:ISO" }`, escrito por upsertPorPolitica em todo import) —
 * nenhum schema novo. Cada fonte é medida por um CAMPO-SENTINELA que todo
 * import daquela fonte escreve; fontes equivalentes (ex.: o poll diário da
 * Partner API também escreve saldoConta) contam como dado fresco, porque o
 * objetivo é detectar DADO STALE, não auditar um mecanismo específico.
 *
 * Limiar em HORAS ÚTEIS: sábados, domingos e feriados (Config
 * BTG_FRESHNESS_FERIADOS, CSV de YYYY-MM-DD) não contam — sem falso-positivo
 * na segunda de manhã. Limiares centralizados aqui, sobrescritíveis via
 * Config DB sem deploy.
 */

const BAHIA_OFFSET_MS = 3 * 3600_000; // Bahia = UTC-3 fixo, sem horário de verão
const DIA_MS = 86_400_000;

export interface ItemFreshness {
  id: string;
  label: string;
  /** Fontes cuja escrita no campo-sentinela conta como dado fresco. */
  fontes: FonteImport[];
  /** Campo-sentinela: escrito por todo import da fonte (ver FIELD_SOURCE_POLICY). */
  campo: string;
  limiarHorasUteisDefault: number;
  /** Chave em Config DB que sobrescreve o limiar sem deploy. */
  configKey: string;
}

// Config central dos itens monitorados — limiares NÃO espalhados pelo código.
export const ITENS_FRESHNESS: ItemFreshness[] = [
  {
    id: "saldo_em_cc",
    label: "Saldo em CC (D-0)",
    // saldoConta: policy ["saldo_em_cc", "api"] — o poll diário da API também
    // mantém o dado fresco; só alerta se AMBOS pararem.
    fontes: ["saldo_em_cc", "api"],
    campo: "saldoConta",
    limiarHorasUteisDefault: 30,
    configKey: "BTG_FRESHNESS_LIMIAR_SALDO_EM_CC_HORAS",
  },
  {
    id: "base_btg",
    label: "Base BTG (D-1)",
    // saldo (PL Total) é exclusivo do arquivo Base BTG (policy ["base_btg"]).
    fontes: ["base_btg"],
    campo: "saldo",
    limiarHorasUteisDefault: 50,
    configKey: "BTG_FRESHNESS_LIMIAR_BASE_BTG_HORAS",
  },
  {
    id: "informacoes",
    label: "Informações (cadastral)",
    // nomeCompleto: policy ["informacoes", "api"] — o poll cadastral semanal
    // da API também conta. Default generoso: cadastral muda devagar.
    fontes: ["informacoes", "api"],
    campo: "nomeCompleto",
    limiarHorasUteisDefault: 360, // 15 dias corridos ~ generoso de propósito
    configKey: "BTG_FRESHNESS_LIMIAR_INFORMACOES_HORAS",
  },
];

/** Dia "YYYY-MM-DD" no fuso America/Bahia. */
function bahiaYmd(d: Date): string {
  return new Date(d.getTime() - BAHIA_OFFSET_MS).toISOString().slice(0, 10);
}

function isDiaUtil(ymd: string, feriados: Set<string>): boolean {
  const dow = new Date(`${ymd}T12:00:00Z`).getUTCDay();
  return dow !== 0 && dow !== 6 && !feriados.has(ymd);
}

/**
 * Horas decorridas entre `de` e `ate` contando só dias úteis (Bahia).
 * Sáb/dom/feriado contribuem 0h — um relatório D-0 importado sexta 18h
 * só "envelhece" de novo na segunda 00:00.
 */
export function horasUteisEntre(de: Date, ate: Date, feriados: Set<string>): number {
  let total = 0;
  let cursor = de.getTime();
  const fim = ate.getTime();
  while (cursor < fim) {
    // próxima meia-noite Bahia depois do cursor
    const shifted = cursor - BAHIA_OFFSET_MS;
    const proximaMeiaNoite = (Math.floor(shifted / DIA_MS) + 1) * DIA_MS + BAHIA_OFFSET_MS;
    const limite = Math.min(proximaMeiaNoite, fim);
    if (isDiaUtil(bahiaYmd(new Date(cursor)), feriados)) {
      total += (limite - cursor) / 3600_000;
    }
    cursor = limite;
  }
  return total;
}

export interface ResultadoItem {
  id: string;
  label: string;
  ultimoSync: string | null; // ISO; null = nunca sincronizado
  horasUteisDesde: number | null;
  limiarHorasUteis: number;
  stale: boolean;
}

async function lerFeriados(): Promise<Set<string>> {
  const raw = (await getConfig("BTG_FRESHNESS_FERIADOS")) ?? "";
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s)),
  );
}

async function lerLimiar(item: ItemFreshness): Promise<number> {
  const raw = await getConfig(item.configKey);
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : item.limiarHorasUteisDefault;
}

/**
 * Varre fonteUltimoUpdate de todos os clientes e devolve, por item
 * monitorado, o timestamp mais recente escrito por uma fonte aceita
 * no campo-sentinela.
 */
async function ultimoSyncPorItem(): Promise<Map<string, Date | null>> {
  const rows = await prisma.clienteBackoffice.findMany({
    select: { fonteUltimoUpdate: true },
  });

  const maxPorItem = new Map<string, Date | null>(ITENS_FRESHNESS.map((i) => [i.id, null]));

  for (const row of rows) {
    const json = row.fonteUltimoUpdate as Record<string, string> | null;
    if (!json) continue;
    for (const item of ITENS_FRESHNESS) {
      const valor = json[item.campo];
      if (typeof valor !== "string") continue;
      const sep = valor.indexOf(":");
      if (sep <= 0) continue;
      const fonte = valor.slice(0, sep);
      if (!item.fontes.includes(fonte as FonteImport)) continue;
      const ts = new Date(valor.slice(sep + 1));
      if (isNaN(ts.getTime())) continue;
      const atual = maxPorItem.get(item.id);
      if (!atual || ts > atual) maxPorItem.set(item.id, ts);
    }
  }

  return maxPorItem;
}

function formatBahia(d: Date): string {
  return d.toLocaleString("pt-BR", {
    timeZone: "America/Bahia",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Executa o heartbeat: calcula freshness por fonte e, se algo estiver stale,
 * manda UMA mensagem consolidada no Slack (webhook já existente).
 * Nunca lança — cron resiliente; falha vira { ok: false }.
 */
export async function verificarFreshnessBtg(): Promise<{
  ok: boolean;
  itens: ResultadoItem[];
  alertaEnviado: boolean;
  erro?: string;
}> {
  try {
    const agora = new Date();
    const [feriados, ultimos] = await Promise.all([lerFeriados(), ultimoSyncPorItem()]);

    const itens: ResultadoItem[] = [];
    for (const item of ITENS_FRESHNESS) {
      const limiar = await lerLimiar(item);
      const ultimo = ultimos.get(item.id) ?? null;
      const horas = ultimo ? horasUteisEntre(ultimo, agora, feriados) : null;
      itens.push({
        id: item.id,
        label: item.label,
        ultimoSync: ultimo?.toISOString() ?? null,
        horasUteisDesde: horas !== null ? Math.round(horas * 10) / 10 : null,
        limiarHorasUteis: limiar,
        stale: ultimo === null || (horas !== null && horas > limiar),
      });
    }

    const stales = itens.filter((i) => i.stale);
    let alertaEnviado = false;
    if (stales.length > 0) {
      const linhas = stales.map((i) =>
        i.ultimoSync
          ? `• *${i.label}*: último sync ${formatBahia(new Date(i.ultimoSync))} (Bahia) — ${i.horasUteisDesde}h úteis atrás (limiar ${i.limiarHorasUteis}h)`
          : `• *${i.label}*: NUNCA sincronizado (limiar ${i.limiarHorasUteis}h)`,
      );
      alertaEnviado = await sendSlackMessage(
        `🚨 *Dados BTG stale — heartbeat de freshness*\n${linhas.join("\n")}\n` +
          `Verificar imports/polls BTG no Cockpit (Backoffice → Importar do BTG / sync-logs).`,
      );
    }

    return { ok: true, itens, alertaEnviado };
  } catch (error) {
    console.error("[btg-freshness] erro:", error);
    return {
      ok: false,
      itens: [],
      alertaEnviado: false,
      erro: error instanceof Error ? error.message : String(error),
    };
  }
}
