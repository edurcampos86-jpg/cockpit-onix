export type PostStatus = "rascunho" | "roteiro_pronto" | "gravado" | "editado" | "agendado" | "publicado";
export type PostFormat = "reel" | "story" | "carrossel";
export type PostCategory = "pergunta_semana" | "onix_pratica" | "patrimonio_mimimi" | "alerta_patrimonial" | "sabado_bastidores";
export type CtaType = "explicito" | "implicito" | "identificacao";
export type TaskStatus = "pendente" | "em_progresso" | "concluida";
export type TaskType = "geral" | "roteiro" | "gravacao" | "edicao" | "agendamento" | "publicacao";
export type TaskPriority = "baixa" | "media" | "alta" | "urgente";
export type LeadStage = "novo" | "qualificado" | "reuniao_agendada" | "proposta_enviada" | "cliente_ativo";
export type LeadTemperature = "quente" | "morno" | "frio";
export type UserRole = "admin" | "support";

export const CATEGORY_LABELS: Record<PostCategory, string> = {
  pergunta_semana: "Pergunta da Semana",
  onix_pratica: "Onix na Prática",
  patrimonio_mimimi: "Patrimônio sem Mimimi",
  alerta_patrimonial: "Alerta Patrimonial",
  sabado_bastidores: "Sábado de Bastidores",
};

export const CATEGORY_DAYS: Record<PostCategory, number> = {
  pergunta_semana: 1,    // Segunda
  onix_pratica: 2,       // Terça
  patrimonio_mimimi: 3,  // Quarta
  alerta_patrimonial: 4, // Quinta
  sabado_bastidores: 6,  // Sábado
};

export const STATUS_LABELS: Record<PostStatus, string> = {
  rascunho: "Rascunho",
  roteiro_pronto: "Roteiro Pronto",
  gravado: "Gravado",
  editado: "Editado",
  agendado: "Agendado",
  publicado: "Publicado",
};

export const STATUS_COLORS: Record<PostStatus, string> = {
  rascunho: "bg-zinc-600",
  roteiro_pronto: "bg-blue-600",
  gravado: "bg-purple-600",
  editado: "bg-amber-600",
  agendado: "bg-cyan-600",
  publicado: "bg-emerald-600",
};

export const FORMAT_LABELS: Record<PostFormat, string> = {
  reel: "Reels",
  story: "Stories",
  carrossel: "Carrossel",
};

export const CTA_LABELS: Record<CtaType, string> = {
  explicito: "Explícito",
  implicito: "Implícito",
  identificacao: "Por Identificação",
};

export const CTA_COLORS: Record<CtaType, string> = {
  explicito: "bg-red-600",
  implicito: "bg-yellow-600",
  identificacao: "bg-emerald-600",
};

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  pendente: "Pendente",
  em_progresso: "Em Progresso",
  concluida: "Concluída",
};

export const DAY_LABELS: Record<number, string> = {
  0: "Domingo",
  1: "Segunda",
  2: "Terça",
  3: "Quarta",
  4: "Quinta",
  5: "Sexta",
  6: "Sábado",
};
