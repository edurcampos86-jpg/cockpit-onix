/**
 * Tipos compartilhados do Painel do Dia.
 *
 * Fontes:
 * - cockpit: local, gravado no Prisma (AcaoPainel + Task)
 * - google: Google Calendar + Gmail via OAuth backend (usa google-calendar.ts)
 * - ms-todo | ms-calendar | ms-mail: Microsoft via cowork (Chrome MCP → cache)
 * - priority-matrix: Appfluence via cowork (Chrome MCP → AcaoPainel)
 * - plaud: webhook Zapier (src/lib/plaud.ts)
 * - datacrazy: API direta (src/lib/datacrazy.ts)
 */

export type OrigemAcao = "cockpit" | "ms-todo" | "priority-matrix";

export type QuadrantePM = "Q1" | "Q2" | "Q3" | "Q4";

export type SyncOperation = "create" | "update" | "delete";

export type FonteCacheExterno = "ms-calendar" | "ms-mail";

export type EventoAgenda = {
  id: string;
  origem: "google" | "ms-calendar";
  titulo: string;
  inicio: string; // ISO 8601
  fim: string; // ISO 8601
  linkReuniao?: string;
  organizador?: string;
  conflitaCom?: string[]; // ids de outros eventos
  /**
   * Origens adicionais que tambem possuem esta mesma entrada (dedupe cruzada).
   * Ex.: evento do Outlook espelhado como tarefa no Priority Matrix.
   * Preenchido pelo agregador apos deduplicarAcoesVsAgenda.
   */
  fontesExtras?: OrigemAcao[];
};

export type EmailAcao = {
  id: string;
  origem: "gmail" | "ms-mail";
  remetente: string;
  assunto: string;
  snippet: string;
  link: string;
  recebidoEm: string; // ISO 8601
  relacionadoComEventoId?: string;
};

export type AcaoUnificada = {
  id: string;
  origem: OrigemAcao;
  titulo: string;
  concluida: boolean;
  vence?: string; // ISO 8601
  importante: boolean;
  noMeuDia: boolean;
  quadrante?: QuadrantePM; // só priority-matrix
  projetoPm?: string;
  externoId?: string;
  pendingSync: boolean;
  syncOp?: SyncOperation;
  syncError?: string;
  // Fecho de atividade (Sugestao 4)
  resultado?: string;
  tempoGastoMin?: number;
  clienteVinculadoId?: string;
  clienteVinculadoNome?: string;
  concluidaEm?: string;
  registradaCrm?: boolean;
};

export type EncerrarAcaoInput = {
  resultado?: string;
  tempoGastoMin?: number;
  clienteVinculadoId?: string;
  proximoPasso?: string; // titulo de follow-up a criar
  registrarCrm?: boolean;
};

export type Prioridade = {
  id: string;
  posicao: 1 | 2 | 3;
  texto: string;
  concluida: boolean;
};

export type IntegracaoStatus = {
  provider: "google" | "microsoft" | "priority-matrix" | "plaud" | "datacrazy";
  status: "conectado" | "desconectado" | "erro" | "em-breve";
  ultimaSincronizacao?: string; // ISO 8601
  mensagemErro?: string;
  /** Texto curto de roadmap para status "em-breve" — aparece em tooltip */
  roadmapInfo?: string;
  /** Sinaliza que a sessao da fonte precisa ser re-autenticada (ex.: Outlook bloqueado pelo banco) */
  sessaoExpirada?: boolean;
};

export type PainelDoDiaPayload = {
  data: string; // "YYYY-MM-DD" em America/Bahia
  agenda: EventoAgenda[];
  emails: EmailAcao[];
  acoes: AcaoUnificada[];
  prioridades: Prioridade[];
  integracoes: IntegracaoStatus[];
  errosPorSecao: Partial<Record<"agenda" | "emails" | "acoes", string>>;
  pendingSyncCount: number;
};

// ============================================
// Inputs dos handlers CRUD
// ============================================

export type CriarAcaoInput = {
  titulo: string;
  origem: OrigemAcao;
  vence?: string;
  importante?: boolean;
  noMeuDia?: boolean;
  quadrante?: QuadrantePM;
  projetoPm?: string;
};

export type AtualizarAcaoInput = Partial<
  Pick<
    AcaoUnificada,
    "titulo" | "concluida" | "vence" | "importante" | "noMeuDia" | "quadrante"
  >
>;

// ============================================
// Payload do cowork-sync (Chrome MCP → cockpit)
// ============================================

export type CoworkSyncPayload = {
  source: "ms-calendar" | "ms-mail" | "ms-todo" | "priority-matrix";
  syncedAt: string; // ISO 8601
  items:
    | EventoAgenda[]
    | EmailAcao[]
    | Array<{
        id?: string; // id local (fecha loop de pending create)
        externoId: string;
        titulo: string;
        concluida: boolean;
        vence?: string;
        importante?: boolean;
        noMeuDia?: boolean;
        quadrante?: QuadrantePM;
        projetoPm?: string;
      }>;
};

// ============================================
// Fila de pedidos de sync (usuario → cowork)
// ============================================

export type SyncRequestSources = "all" | "microsoft" | "priority-matrix";
export type SyncRequestStatus = "pending" | "in-progress" | "done" | "error";

export type SyncRequestDTO = {
  id: string;
  sources: SyncRequestSources;
  status: SyncRequestStatus;
  requestedAt: string;
  completedAt?: string;
  error?: string;
};
