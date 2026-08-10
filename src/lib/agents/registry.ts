import type { Agent } from "./types";
import { corretoraAgent } from "./agents/corretora";
import { kpisAgent } from "./agents/kpis";

/**
 * Os agentes do runtime interno.
 *
 * O "Copiloto Onix" (`agents/cockpit.ts`) foi REMOVIDO — era o assistente de
 * orientação geral que atendia toda rota sem agente próprio. Os dois que
 * ficam são especialistas: cada um sabe de uma área e só é oferecido nela.
 */
const AGENTS: Record<string, Agent> = {
  [corretoraAgent.id]: corretoraAgent,
  [kpisAgent.id]: kpisAgent,
};

export function getAgent(id: string): Agent | null {
  return AGENTS[id] ?? null;
}

/** O que o chat precisa saber para se apresentar — sem o prompt nem as ferramentas. */
export type AgentMetadata = Pick<Agent, "id" | "name" | "subtitle" | "intro" | "suggestions">;

/**
 * O metadado de UM agente, ou `null` se o id não existe.
 *
 * Substituiu um `listAgentMetadata()` que devolvia o catálogo inteiro. O
 * cliente sempre soube de qual agente precisava (`agentePorRota` roda antes de
 * montar o chat) e mesmo assim recebia todos: quem abria "/kpis" levava junto
 * o `intro` e as `suggestions` da Corretora, que descrevem o pipeline dela.
 * Metadado de agente é texto escrito para o operador daquela área — não é
 * segredo, mas também não tem por que viajar para quem não abriu a página.
 */
export function getAgentMetadata(id: string): AgentMetadata | null {
  const a = AGENTS[id];
  if (!a) return null;
  return { id: a.id, name: a.name, subtitle: a.subtitle, intro: a.intro, suggestions: a.suggestions };
}

/**
 * Reexportado de `./rotas`, que é PURO e client-safe.
 *
 * A regra não mora aqui porque o botão flutuante (`'use client'`) precisa da
 * mesma resposta e não pode importar este arquivo: a cadeia
 * `agents/kpis.ts` → `snapshot.ts` abre com `server-only`. Manter a
 * reexportação evita quebrar quem já importava daqui.
 */
export { agentePorRota } from "./rotas";
