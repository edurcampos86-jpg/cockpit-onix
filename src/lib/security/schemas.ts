import { z } from "zod";

/**
 * Schemas Zod compartilhados para validar inputs sensíveis.
 * Mantém limite de tamanho conservador para evitar DoS via payload gigante.
 */

const txt = (max: number) => z.string().trim().max(max);
const optionalTxt = (max: number) => txt(max).optional().nullable();

/** /api/onix-corretora/ingest — relatório de IA enviado por sistema externo. */
export const ingestRelatorioSchema = z.object({
  api_secret: z.string().min(1).max(512),
  vendedor: txt(120),
  periodo: txt(64),
  periodoInicio: txt(64),
  periodoFim: txt(64),
  dataExecucao: optionalTxt(64),
  conversasAnalisadas: z.coerce.number().int().min(0).max(100_000),
  pdfPath: optionalTxt(512),
  secao0: optionalTxt(20_000),
  secao1: txt(20_000),
  secao2: txt(20_000),
  secao3: txt(20_000),
  secao4: txt(20_000),
  secao5: txt(20_000),
  scriptSemana: optionalTxt(20_000),
  termometro: optionalTxt(20_000),
  retomada: optionalTxt(20_000),
  acoes: z
    .array(
      z.object({
        numero: z.coerce.number().int().min(1).max(999),
        titulo: txt(500),
        descricao: txt(5_000),
      }),
    )
    .max(100)
    .optional(),
  metricas: z
    .object({
      conversasSemResposta: z.coerce.number().min(0).max(100_000).optional(),
      reunioesAgendadas: z.coerce.number().min(0).max(100_000).optional(),
      leadsPerdidos: z.coerce.number().min(0).max(100_000).optional(),
    })
    .optional()
    .nullable(),
});
export type IngestRelatorio = z.infer<typeof ingestRelatorioSchema>;

/** /api/integracoes/zapier/webhook — payload do Plaud via Zapier (formato variável). */
export const zapierPlaudPayloadSchema = z
  .object({
    title: optionalTxt(500),
    meeting_title: optionalTxt(500),
    subject: optionalTxt(500),
    name: optionalTxt(500),
    date: optionalTxt(64),
    meeting_date: optionalTxt(64),
    created_at: optionalTxt(64),
    duration: z.union([z.coerce.number().min(0).max(86_400), z.string().max(32)]).optional(),
    participants: z
      .union([z.array(txt(200)).max(50), txt(2_000)])
      .optional()
      .nullable(),
    vendedor: optionalTxt(200),
    salesperson: optionalTxt(200),
    seller: optionalTxt(200),
    transcription: optionalTxt(200_000),
    transcript: optionalTxt(200_000),
    text: optionalTxt(200_000),
    content: optionalTxt(200_000),
    summary: optionalTxt(20_000),
    ai_summary: optionalTxt(20_000),
    description: optionalTxt(20_000),
    action_items: z.union([z.array(txt(2_000)).max(100), txt(20_000)]).optional().nullable(),
    audio_url: optionalTxt(2_000),
    recording_url: optionalTxt(2_000),
    file_url: optionalTxt(2_000),
    external_id: optionalTxt(200),
    id: optionalTxt(200),
    plaud_id: optionalTxt(200),
    recording_id: optionalTxt(200),
    zap_id: optionalTxt(200),
    timestamp: optionalTxt(64),
  })
  .passthrough(); // Zapier pode mandar campos extras; toleramos mas não usamos.

/** /api/backoffice/clientes — lote de clientes vindos da planilha BTG. */
export const clientesBatchSchema = z.object({
  clientes: z
    .array(
      z.object({
        nome: txt(200),
        numeroConta: txt(64),
        saldo: z.union([z.coerce.number(), txt(64)]),
      }),
    )
    .min(1)
    .max(10_000),
});
export type ClientesBatch = z.infer<typeof clientesBatchSchema>;

/** /api/painel-do-dia/acoes — ação criada pelo usuário. */
export const acaoPainelSchema = z.object({
  titulo: txt(500).min(1, "Título obrigatório"),
  origem: z.enum(["cockpit", "ms-todo", "priority-matrix"]),
  vence: optionalTxt(64),
  importante: z.boolean().optional(),
  noMeuDia: z.boolean().optional(),
  quadrante: z.enum(["Q1", "Q2", "Q3", "Q4"]).optional().nullable(),
  projetoPm: optionalTxt(64),
});
export type AcaoPainelInput = z.infer<typeof acaoPainelSchema>;

/** /api/integracoes/config — chave/valor a salvar no storage cifrado. */
export const integrationConfigSchema = z.object({
  key: txt(64).min(1),
  value: txt(4_096).min(1),
});
