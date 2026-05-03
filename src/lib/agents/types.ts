export interface AgentMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AgentRequestContext {
  pathname?: string;
  userId?: string;
  userName?: string;
  userRole?: string;
}

export interface Agent {
  id: string;
  name: string;
  subtitle: string;
  intro: string;
  suggestions: string[];
  systemPromptBase: string;
  loadContext?: (ctx: AgentRequestContext) => Promise<string>;
  maxTokens?: number;
}
