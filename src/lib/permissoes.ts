/**
 * Permissões granulares de visualização do Ecossistema Onix.
 *
 * Cada pessoa pode ter um conjunto de flags que define quais módulos ela enxerga.
 * Admin (User.role === "admin" OU Pessoa.teamRole === "admin") ignora as flags
 * — sempre vê tudo. Pessoas com permissoes=null são tratadas como "tudo liberado"
 * (compat com cadastros anteriores à feature).
 *
 * As checagens acontecem em 3 camadas:
 *   1. Sidebar (UI) — esconde módulos negados
 *   2. proxy.ts (middleware) — bloqueia rotas
 *   3. Layouts/pages dos módulos — re-checam server-side
 */

export type ModuloEcossistema =
  | "mkt" // Mídias Sociais (calendário, roteiros, leads, analytics…)
  | "corretora" // /onix-corretora/*
  | "backoffice" // /backoffice/* (Assessoria — clientes, cadência…)
  | "time" // /time, /time/[id]
  | "timeInsights" // /time/insights
  | "metodo" // /metodo
  | "glossario" // /glossario
  | "integracoes" // /integracoes
  | "configuracoes"; // /configuracoes

export type PermissoesAcesso = Record<ModuloEcossistema, boolean>;

export const MODULOS: {
  key: ModuloEcossistema;
  label: string;
  descricao: string;
  pathPrefix: string | null; // null = módulo raiz (Mídias Sociais usa "/")
  rotasExtras?: string[]; // outras rotas que pertencem a esse módulo
}[] = [
  {
    key: "mkt",
    label: "Mídias Sociais",
    descricao: "Calendário, roteiros, planejamento, leads, analytics, KPIs e reuniões da operação de conteúdo do Eduardo.",
    pathPrefix: null,
    rotasExtras: [
      "/calendario",
      "/roteiros",
      "/planejamento",
      "/tarefas",
      "/leads",
      "/relatorio",
      "/analytics",
      "/kpis",
      "/reunioes",
    ],
  },
  {
    key: "corretora",
    label: "Onix Corretora",
    descricao: "Painel da corretora — treinamento comercial, relatórios, alertas de pipeline, rituais e perfis do time.",
    pathPrefix: "/onix-corretora",
  },
  {
    key: "backoffice",
    label: "Assessoria (Backoffice)",
    descricao: "Carteira BTG do Eduardo — clientes, cadência 12-4-2, storyselling, receita, indicações e performance.",
    pathPrefix: "/backoffice",
  },
  {
    key: "time",
    label: "Time (cadastro de pessoas)",
    descricao: "Lista do time e ficha individual de cada pessoa — identificação, vínculo, hierarquia.",
    pathPrefix: "/time",
  },
  {
    key: "timeInsights",
    label: "Insights do Time",
    descricao: "Visão consolidada de aniversários, alertas e estatísticas do time.",
    pathPrefix: "/time/insights",
  },
  {
    key: "metodo",
    label: "Método Onix",
    descricao: "Manifesto, princípios e doutrina interna.",
    pathPrefix: "/metodo",
  },
  {
    key: "glossario",
    label: "Glossário",
    descricao: "Dicionário de termos do mercado e do método Onix.",
    pathPrefix: "/glossario",
  },
  {
    key: "integracoes",
    label: "Integrações",
    descricao: "Conexões externas: Plaud, Zapier, Datacrazy, Microsoft, Google.",
    pathPrefix: "/integracoes",
  },
  {
    key: "configuracoes",
    label: "Configurações",
    descricao: "Chaves de API, prompts, ajustes do ecossistema.",
    pathPrefix: "/configuracoes",
  },
];

/** Default seguro: tudo true (mantém compat). Usado quando permissoes=null. */
export const PERMISSOES_TUDO: PermissoesAcesso = {
  mkt: true,
  corretora: true,
  backoffice: true,
  time: true,
  timeInsights: true,
  metodo: true,
  glossario: true,
  integracoes: true,
  configuracoes: true,
};

export const PERMISSOES_NADA: PermissoesAcesso = {
  mkt: false,
  corretora: false,
  backoffice: false,
  time: false,
  timeInsights: false,
  metodo: false,
  glossario: false,
  integracoes: false,
  configuracoes: false,
};

/* ──────────────────────────────────────────────────────────────────────────
   TEMPLATES — atalhos para o admin aplicar perfis comuns com 1 clique.
   ────────────────────────────────────────────────────────────────────────── */

export type TemplatePermissao = {
  id: string;
  label: string;
  descricao: string;
  permissoes: PermissoesAcesso;
};

export const TEMPLATES: TemplatePermissao[] = [
  {
    id: "full",
    label: "Acesso total",
    descricao: "Vê tudo — usado para sócios e gestores que precisam de visão completa.",
    permissoes: PERMISSOES_TUDO,
  },
  {
    id: "corretora-only",
    label: "Corretora",
    descricao: "Vê apenas o módulo da Onix Corretora + Método/Glossário. Ideal para vendedores e líder comercial da corretora.",
    permissoes: {
      ...PERMISSOES_NADA,
      corretora: true,
      metodo: true,
      glossario: true,
    },
  },
  {
    id: "backoffice-only",
    label: "Assessoria",
    descricao: "Vê apenas Backoffice/Assessoria + Método/Glossário. Ideal para assistente de carteira e backoffice.",
    permissoes: {
      ...PERMISSOES_NADA,
      backoffice: true,
      metodo: true,
      glossario: true,
    },
  },
  {
    id: "mkt-only",
    label: "Mídias Sociais",
    descricao: "Vê apenas Mídias Sociais + Método/Glossário. Ideal para social media, editor de vídeo e produtores.",
    permissoes: {
      ...PERMISSOES_NADA,
      mkt: true,
      metodo: true,
      glossario: true,
    },
  },
  {
    id: "visitante",
    label: "Visitante",
    descricao: "Vê apenas Método e Glossário — onboarding inicial de quem ainda não tem função clara.",
    permissoes: {
      ...PERMISSOES_NADA,
      metodo: true,
      glossario: true,
    },
  },
  {
    id: "nenhum",
    label: "Nenhum módulo",
    descricao: "Desliga tudo. Pessoa ainda consegue logar mas não vê nada útil até admin liberar algum módulo.",
    permissoes: PERMISSOES_NADA,
  },
];

/* ──────────────────────────────────────────────────────────────────────────
   HELPERS
   ────────────────────────────────────────────────────────────────────────── */

/**
 * Normaliza um valor vindo do banco (Json) para o tipo PermissoesAcesso.
 * - null/undefined → tudo true (compat com cadastros antigos)
 * - objeto parcial → merge com PERMISSOES_TUDO (chave ausente = true)
 */
export function normalizePermissoes(raw: unknown): PermissoesAcesso {
  if (!raw || typeof raw !== "object") return { ...PERMISSOES_TUDO };
  const obj = raw as Record<string, unknown>;
  const result: PermissoesAcesso = { ...PERMISSOES_TUDO };
  for (const key of Object.keys(PERMISSOES_TUDO) as ModuloEcossistema[]) {
    if (key in obj) {
      result[key] = Boolean(obj[key]);
    }
  }
  return result;
}

/**
 * Encontra a qual módulo um path pertence. Retorna null se for rota
 * "neutra" (ex.: /api, /login, /onboarding, /onix-corretora/ingest público).
 *
 * Regras de match (mais específico ganha):
 *   1. /time/insights → timeInsights
 *   2. pathPrefix exato ou início (ex.: /onix-corretora, /onix-corretora/alertas)
 *   3. rotasExtras (Mídias Sociais é especial — usa raízes específicas)
 *   4. "/" exato → mkt (painel)
 */
export function moduloDaRota(path: string): ModuloEcossistema | null {
  // /time/insights antes de /time (mais específico)
  if (path === "/time/insights" || path.startsWith("/time/insights/")) {
    return "timeInsights";
  }

  for (const mod of MODULOS) {
    if (mod.key === "mkt" || mod.key === "timeInsights") continue; // tratados separados
    if (mod.pathPrefix && (path === mod.pathPrefix || path.startsWith(mod.pathPrefix + "/"))) {
      return mod.key;
    }
  }

  // Mídias Sociais: painel + rotas extras
  if (path === "/") return "mkt";
  const mkt = MODULOS.find((m) => m.key === "mkt");
  if (mkt?.rotasExtras?.some((r) => path === r || path.startsWith(r + "/"))) {
    return "mkt";
  }

  return null;
}
