import { getConfig } from "@/lib/config-db";
import { flagLigada } from "@/lib/flags/registro";

/**
 * Gate (Config DB) do refino da tela de Implementações e do modal do FAB:
 * busca, ordenação, autor/data, unidades por cabeçalho, presets, posição no
 * ranking, "Por quê" inteiro, autosave com desfazer, e a checagem de duplicatas
 * ao digitar. Flag PRÓPRIA, default OFF.
 *
 * Config DB, e NÃO `NEXT_PUBLIC_FLAG_*`: não existe uma única flag de env neste
 * repositório. As 15 flags vivem numa allowlist lida do banco
 * (`lib/flags/registro.ts`), o que permite ligar e desligar sem rebuild — uma
 * flag de env exigiria um deploy para cada virada de chave, justamente o que
 * torna um gate inútil quando algo dá errado às 18h.
 *
 * OFF → a tela renderiza exatamente como antes desta entrega, e o modal do FAB
 * também. Deploy com a chave ausente não muda nada visível.
 */
export const IMPLEMENTACOES_V2_FLAG = "IMPLEMENTACOES_V2";

/** Refino da tela/modal habilitado? Lê a flag do Config DB a cada chamada. Default OFF. */
export async function implementacoesV2Habilitado(): Promise<boolean> {
  return flagLigada(await getConfig(IMPLEMENTACOES_V2_FLAG));
}
