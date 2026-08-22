import { getConfig } from "@/lib/config-db";
import { flagLigada } from "@/lib/flags/registro";

/**
 * Gate (Config DB) do REGISTRO RICO do cliente. Default OFF.
 *
 * OFF → a ficha do cliente fica byte-idêntica à de hoje: nenhuma aba nova,
 *       nenhum botão novo, nenhum selo de origem. As tabelas novas existem no
 *       banco e ficam vazias.
 * ON  → aparecem o popover de contato, o modal de agrupar contas, o drawer de
 *       registro (Ligação/Reunião), o painel de revisar transcrição, a aba
 *       Preparar reunião e os selos de origem nos campos editáveis.
 *
 * Computada no SERVER (page.tsx) e passada como prop para os componentes
 * client — mesmo padrão de `cockpitReuniaoHabilitado`.
 *
 * As ROTAS também consultam esta flag e respondem 404 com ela desligada. Gate
 * só de UI protegeria a tela e deixaria o endpoint aberto — e as rotas daqui
 * escrevem em campo de cliente e propagam contato para outras contas.
 *
 * Ativar local: `CLIENTES_REGISTRO_RICO=1` no `.env.local`, ou
 * INSERT INTO "Config" (key,value) VALUES ('CLIENTES_REGISTRO_RICO','1').
 */
export const CLIENTES_REGISTRO_RICO_FLAG = "CLIENTES_REGISTRO_RICO";

/** Registro rico habilitado? Lê a flag do Config DB a cada chamada. Default OFF. */
export async function registroRicoHabilitado(): Promise<boolean> {
  return flagLigada(await getConfig(CLIENTES_REGISTRO_RICO_FLAG));
}
