import type { Agent } from "./types";
import { cockpitAgent } from "./agents/cockpit";
import { corretoraAgent } from "./agents/corretora";
import { kpisAgent } from "./agents/kpis";

const AGENTS: Record<string, Agent> = {
  [cockpitAgent.id]: cockpitAgent,
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

export function pickAgentForPath(pathname: string): string {
  if (pathname.startsWith("/onix-corretora")) return "corretora";
  if (pathname.startsWith("/kpis") || pathname.startsWith("/analytics")) return "kpis";
  return "cockpit";
}
