import { PECAS, pecaDe } from "@/lib/grade/pecas";
import { GRADE } from "@/lib/grade/semanal";

export type PostStatus = "rascunho" | "roteiro_pronto" | "gravado" | "editado" | "agendado" | "publicado";
export type PostFormat = "reel" | "story" | "carrossel";
export type PostCategory = "pergunta_semana" | "onix_pratica" | "patrimonio_mimimi" | "alerta_patrimonial" | "sabado_bastidores";
export type CtaType = "explicito" | "implicito" | "identificacao" | "algoritmo";
export type PilarEditorial = "P1" | "P2" | "P3" | "P4";
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

/**
 * DERIVADO de `src/lib/grade/semanal.ts`. Antes esta constante e
 * `DAY_CATEGORY_MAP` eram uma o inverso da outra, mantidas à mão — duas
 * listas que podiam discordar em silêncio. Agora as duas saem da mesma
 * grade, e o nome exportado ficou igual para nada mais precisar mudar.
 */
export const CATEGORY_DAYS: Record<PostCategory, number> = Object.fromEntries(
  GRADE.map((p) => [p.categoria, p.dia]),
) as Record<PostCategory, number>;

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
  algoritmo: "Algoritmo (Salva/Compartilha)",
};

export const CTA_COLORS: Record<CtaType, string> = {
  explicito: "bg-red-600",
  implicito: "bg-yellow-600",
  identificacao: "bg-emerald-600",
  algoritmo: "bg-violet-600",
};

// Pilares editoriais (v4)
export const PILAR_LABELS: Record<PilarEditorial, string> = {
  P1: "Blindagem Patrimonial",
  P2: "Casos Reais",
  P3: "Cenário e Alertas",
  P4: "Eduardo Pessoa",
};

export const PILAR_COLORS: Record<PilarEditorial, string> = {
  P1: "bg-blue-600 text-blue-100",
  P2: "bg-amber-600 text-amber-100",
  P3: "bg-red-600 text-red-100",
  P4: "bg-emerald-600 text-emerald-100",
};

// Mapeamento categoria → pilar
export const CATEGORY_PILAR_MAP: Record<PostCategory, PilarEditorial> = {
  pergunta_semana: "P1",
  onix_pratica: "P2",
  patrimonio_mimimi: "P1",
  alerta_patrimonial: "P3",
  sabado_bastidores: "P4",
};

// Distribuição ideal de pilares por semana (v4)
export const PILAR_WEEKLY_GOAL: Record<PilarEditorial, number> = {
  P1: 2,
  P2: 1,
  P3: 1,
  P4: 1,
};

// Banco de hooks por categoria (Framework PARE — v4)
export const HOOK_BANK: Record<PostCategory, string[]> = {
  pergunta_semana: [
    "Você sabe exatamente quanto paga de imposto por ano?",
    "Se você faltar amanhã, sua família sabe o que fazer?",
    "Você tem reserva de emergência ou só acha que tem?",
    "Sua previdência privada está te custando ou te protegendo?",
    "Holding familiar: proteção real ou modismo?",
  ],
  onix_pratica: [
    "Em 19 anos de assessoria, o erro #1 que vejo é...",
    "PJ médica: você está deixando dinheiro na mesa do governo.",
    "Ele ganhava R$60k/mês e não tinha R$10k disponível.",
    "O custo invisível de não ter seguro de vida.",
    "Financiamento, consórcio ou à vista? A matemática real.",
  ],
  patrimonio_mimimi: [
    "5 sinais que você paga caro nos investimentos sem saber",
    "Pró-labore vs. distribuição de lucros: o comparativo real",
    "3 seguros que todo profissional de alta renda deveria ter",
    "Checklist emergência financeira (completo)",
    "PGBL vs. VGBL: o guia definitivo para quem ganha mais de R$30k",
  ],
  alerta_patrimonial: [
    "Na Bahia, o ITCMD pode custar até 8% do patrimônio.",
    "Renda fixa não é segura do jeito que você pensa.",
    "Seu patrimônio está protegido do inventário?",
    "O custo invisível do dinheiro parado no bancão.",
    "Se você tem mais de R$500k investidos, isso te interessa.",
  ],
  sabado_bastidores: [
    "Liberdade não é acidente. É consequência.",
    "O melhor conselho financeiro que já recebi.",
    "Por que escolhi trabalhar com médicos.",
    "Minha rotina matinal — disciplina é liberdade.",
    "19 anos de carreira — o que me mantém motivado.",
  ],
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

// Dia da semana → categoria/formato recomendados. DERIVADOS da grade.
export const DAY_CATEGORY_MAP: Partial<Record<number, PostCategory>> =
  Object.fromEntries(GRADE.map((p) => [p.dia, p.categoria]));

/**
 * DERIVADO: o formato vem da PEÇA, não do dia.
 *
 * Este mapa continua existindo por compatibilidade com quem já o consome,
 * mas a fonte inverteu: a Pergunta da Semana é story caia onde cair. Quem
 * souber a categoria deve preferir `pecaDe(categoria).formato`, que não
 * precisa passar pelo dia.
 */
export const DAY_FORMAT_MAP: Partial<Record<number, PostFormat>> =
  Object.fromEntries(
    GRADE.flatMap((p) => {
      const peca = pecaDe(p.categoria);
      return peca ? [[p.dia, peca.formato] as const] : [];
    }),
  );

/** DERIVADO de `src/lib/grade/pecas.ts` — o CTA pende da peça. */
export const CATEGORY_CTA_MAP: Record<PostCategory, CtaType> =
  Object.fromEntries(PECAS.map((p) => [p.categoria, p.cta])) as Record<
    PostCategory,
    CtaType
  >;
