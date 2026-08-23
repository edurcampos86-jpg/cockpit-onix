import { getConfig } from "@/lib/config-db";
import { flagLigada } from "@/lib/flags/registro";

/**
 * Gate (Config DB) do ORGANOGRAMA na rota raiz `/`. Flag própria, default OFF.
 *
 * ── POR QUE NÃO REUSAR `HUB_ECOSSISTEMA` ────────────────────────────────
 * São dois desenhos DIFERENTES para a mesma rota: o hub é a órbita de 8 nós,
 * o organograma é a árvore de 48. Pendurar os dois na mesma chave tiraria a
 * única coisa que importa aqui — poder ligar um, olhar, e voltar para o outro
 * sem deploy. Com chaves separadas, comparar os dois é virar uma chave.
 *
 * A precedência está em `src/app/page.tsx` e é deliberada: organograma vence o
 * hub, e o hub vence o Painel de Comando. Ligar as duas não é erro a punir com
 * tela em branco; é alguém comparando desenhos, e a resposta certa é mostrar o
 * mais novo.
 *
 * Ligar/desligar é por linha na tabela Config, SEM rebuild e SEM redeploy:
 *   INSERT INTO "Config" (key, value) VALUES ('ORGANOGRAMA_HOME', '1')
 *     ON CONFLICT (key) DO UPDATE SET value = '1';
 *   -- desligar: UPDATE "Config" SET value = '0' WHERE key = 'ORGANOGRAMA_HOME';
 *
 * Local, dá para usar o fallback de env do getConfig: `ORGANOGRAMA_HOME=1` no
 * `.env.local`.
 */
export const ORGANOGRAMA_HOME_FLAG = "ORGANOGRAMA_HOME";

/** Organograma na raiz? Lê a flag do Config DB a cada chamada. Default OFF. */
export async function organogramaHomeHabilitado(): Promise<boolean> {
  return flagLigada(await getConfig(ORGANOGRAMA_HOME_FLAG));
}
