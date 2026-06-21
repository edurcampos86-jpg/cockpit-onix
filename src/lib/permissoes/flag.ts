import { getConfig } from "@/lib/config-db";

/**
 * Gate (Config DB) da tela Configurações > Permissões (RBAC Fase 3 UI). Flag
 * PRÓPRIA, default OFF — espelha o padrão de `implementacoesInlineHabilitado`.
 *
 * OFF → a página /configuracoes/permissoes responde notFound() e o link no nav
 * não aparece (o endpoint /api/configuracoes/permissoes/flag responde
 * { enabled: false }). Ligável sem rebuild pelo Config DB.
 *
 * Ativar: `PERMISSOES_UI=1` no env, ou linha na tabela Config
 * (INSERT INTO "Config"(key,value) VALUES ('PERMISSOES_UI','1')).
 */
export const PERMISSOES_UI_FLAG = "PERMISSOES_UI";

function parseBoolFlag(v: string | undefined): boolean {
  if (!v) return false;
  return ["1", "true", "on", "yes", "sim"].includes(v.trim().toLowerCase());
}

/** Tela de Permissões habilitada? Lê a flag do Config DB a cada chamada. Default OFF. */
export async function permissoesUiHabilitado(): Promise<boolean> {
  return parseBoolFlag(await getConfig(PERMISSOES_UI_FLAG));
}
