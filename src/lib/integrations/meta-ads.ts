import "server-only";
import { getConfig } from "@/lib/config-db";

/**
 * F5 Meta Ads (Fase 1) — cliente da Marketing API (insights).
 *
 * Sem SDK: fetch direto na Graph API, padrão das demais integrações
 * (btg.ts, datacrazy, manychat). Credenciais via Config DB/env do
 * Railway (`getConfig`); ausentes = integração desativada — quem chama
 * decide o comportamento (cron pula em silêncio, status reporta
 * configured:false).
 */

export type MetaAdsConfig = {
  accessToken: string;
  adAccountId: string; // formato act_XXXXXXXXX
  pixelId?: string;
  graphVersion: string;
};

export async function getMetaAdsConfig(): Promise<MetaAdsConfig | null> {
  const [accessToken, adAccountId, pixelId, graphVersion] = await Promise.all([
    getConfig("META_ACCESS_TOKEN"),
    getConfig("META_AD_ACCOUNT_ID"),
    getConfig("META_PIXEL_ID"),
    getConfig("META_GRAPH_VERSION"),
  ]);
  if (!accessToken || !adAccountId) return null;
  return {
    accessToken,
    adAccountId,
    pixelId: pixelId || undefined,
    graphVersion: graphVersion || "v19.0",
  };
}

export type InsightRow = {
  date: string; // YYYY-MM-DD
  campaignId: string;
  campaignName: string | null;
  adsetId: string;
  adId: string;
  impressions: number;
  clicks: number;
  spendBrl: number;
  cpmBrl: number | null;
  cpcBrl: number | null;
  results: number | null;
  resultType: string | null;
};

type GraphInsight = {
  date_start?: string;
  campaign_id?: string;
  campaign_name?: string;
  adset_id?: string;
  ad_id?: string;
  impressions?: string;
  clicks?: string;
  spend?: string;
  cpm?: string;
  cpc?: string;
  actions?: Array<{ action_type: string; value: string }>;
};

/* Ação que conta como "resultado" no piloto (geração de leads). */
const RESULT_ACTION_TYPES = ["lead", "onsite_conversion.lead_grouped"];

function parseRow(r: GraphInsight): InsightRow | null {
  if (!r.campaign_id || !r.date_start) return null;
  const resultAction = r.actions?.find((a) =>
    RESULT_ACTION_TYPES.includes(a.action_type)
  );
  return {
    date: r.date_start,
    campaignId: r.campaign_id,
    campaignName: r.campaign_name ?? null,
    adsetId: r.adset_id ?? "",
    adId: r.ad_id ?? "",
    impressions: Number(r.impressions ?? 0),
    clicks: Number(r.clicks ?? 0),
    spendBrl: Number(r.spend ?? 0),
    cpmBrl: r.cpm != null ? Number(r.cpm) : null,
    cpcBrl: r.cpc != null ? Number(r.cpc) : null,
    results: resultAction ? Number(resultAction.value) : null,
    resultType: resultAction ? resultAction.action_type : null,
  };
}

/**
 * Busca insights de um dia (level=ad), com paginação.
 * `dateISO` no formato YYYY-MM-DD.
 */
export async function fetchInsightsDay(
  cfg: MetaAdsConfig,
  dateISO: string
): Promise<InsightRow[]> {
  const fields =
    "date_start,campaign_id,campaign_name,adset_id,ad_id,impressions,clicks,spend,cpm,cpc,actions";
  const timeRange = encodeURIComponent(
    JSON.stringify({ since: dateISO, until: dateISO })
  );
  let url: string | null =
    `https://graph.facebook.com/${cfg.graphVersion}/${cfg.adAccountId}/insights` +
    `?level=ad&fields=${fields}&time_range=${timeRange}&limit=100` +
    `&access_token=${encodeURIComponent(cfg.accessToken)}`;

  const rows: InsightRow[] = [];
  let guard = 0;
  while (url && guard < 20) {
    guard++;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Marketing API ${res.status}: ${body.slice(0, 300)}`);
    }
    const json: { data?: GraphInsight[]; paging?: { next?: string } } =
      await res.json();
    for (const r of json.data ?? []) {
      const parsed = parseRow(r);
      if (parsed) rows.push(parsed);
    }
    url = json.paging?.next ?? null;
  }
  return rows;
}

/** Mascara o Pixel ID pra exibição (só os 4 últimos dígitos). */
export function maskPixelId(pixelId: string | undefined): string | null {
  if (!pixelId) return null;
  return pixelId.length <= 4 ? pixelId : `…${pixelId.slice(-4)}`;
}
