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

export function listAgentMetadata(): Array<Pick<Agent, "id" | "name" | "subtitle" | "intro" | "suggestions">> {
  return Object.values(AGENTS).map((a) => ({
    id: a.id,
    name: a.name,
    subtitle: a.subtitle,
    intro: a.intro,
    suggestions: a.suggestions,
  }));
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
