import "server-only";
import { getConfig } from "@/lib/config-db";

/**
 * Gate de sanidade do import "Saldo em CC" (fonte saldo_em_cc).
 *
 * Pré-requisito pra automação diária: arquivo anômalo é rejeitado INTEIRO
 * antes de qualquer escrita — nunca import parcial. A rota recebe JSON já
 * mapeado (o parse XLSX é client-side), então a validação de cabeçalho
 * acontece por proxy: header fora do xlsx-mapping derruba o aproveitamento
 * (linha sem Conta/Nome vira descarte antes deste gate).
 *
 * Limiares centralizados aqui, sobrescritíveis via Config DB sem deploy —
 * mesmo padrão do btg-freshness.
 */
export const SANITY_SALDO_CC = {
  // Linhas válidas ÷ tamanho da base atual. Base ~2.600 clientes: planilha
  // truncada (ex.: 100 linhas) fica MUITO abaixo de 50% e é rejeitada.
  minRatioBase: 0.5,
  configKeyRatioBase: "IMPORT_SANITY_SALDO_CC_MIN_RATIO_BASE",
  // Linhas válidas ÷ linhas recebidas (proxy de cabeçalho, ver acima).
  minRatioValidas: 0.9,
  configKeyRatioValidas: "IMPORT_SANITY_SALDO_CC_MIN_RATIO_VALIDAS",
};

async function lerRatio(configKey: string, fallback: number): Promise<number> {
  const raw = await getConfig(configKey);
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 && n <= 1 ? n : fallback;
}

export async function gateSanidadeSaldoCc(args: {
  recebidas: number;
  validas: number;
  baseAtual: number;
}): Promise<{ ok: true } | { ok: false; erro: string }> {
  const { recebidas, validas, baseAtual } = args;
  const [minRatioBase, minRatioValidas] = await Promise.all([
    lerRatio(SANITY_SALDO_CC.configKeyRatioBase, SANITY_SALDO_CC.minRatioBase),
    lerRatio(SANITY_SALDO_CC.configKeyRatioValidas, SANITY_SALDO_CC.minRatioValidas),
  ]);

  if (recebidas > 0 && validas / recebidas < minRatioValidas) {
    return {
      ok: false,
      erro:
        `Gate de sanidade (Saldo em CC): só ${validas} de ${recebidas} linhas têm ` +
        `Conta/Nome reconhecíveis (mínimo ${Math.round(minRatioValidas * 100)}%). ` +
        `Cabeçalhos fora do padrão xlsx-mapping? Nada foi importado.`,
    };
  }

  // Base vazia = primeiro uso/ambiente de dev: sem referência pra comparar.
  if (baseAtual > 0 && validas < baseAtual * minRatioBase) {
    return {
      ok: false,
      erro:
        `Gate de sanidade (Saldo em CC): planilha com ${validas} linhas válidas vs ` +
        `base de ${baseAtual} clientes (mínimo ${Math.round(minRatioBase * 100)}%). ` +
        `Arquivo truncado/incompleto? Nada foi importado.`,
    };
  }

  return { ok: true };
}
