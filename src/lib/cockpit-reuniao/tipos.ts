/**
 * Tipos compartilhados do CONTEÚDO dos campos Json de `ReuniaoEstruturada`.
 *
 * O schema Prisma guarda `pautas` / `pendencias` / `proximosPassos` como `Json?`
 * (livre no banco). Estes tipos são o contrato validado NA APLICAÇÃO — a Server
 * Action `criarReuniaoEstruturada` coage o input do formulário para estas formas
 * antes de gravar, e a leitura (cockpit-reuniao-tab) interpreta de volta.
 *
 * `ItemAcionavel` espelha o shape de `ProximoPasso` de ReuniaoTime
 * (`{ texto, concluido, concluidoEm }`) para que pendências e próximos passos
 * possam, no futuro, ser marcados como concluídos sem mudar o shape gravado.
 */

/** Item que pode ser marcado como concluído (pendência ou próximo passo). */
export type ItemAcionavel = {
  texto: string;
  concluido: boolean;
  concluidoEm: string | null; // ISO; null enquanto aberto
};

/** Um tópico de pauta da reunião. */
export type PautaItem = { texto: string };

/** Lista de pautas da reunião. */
export type ReuniaoPautas = PautaItem[];

/** Pendências separadas por lado (quem deve a ação). */
export type ReuniaoPendencias = {
  assessor: ItemAcionavel[];
  cliente: ItemAcionavel[];
};

/** Próximos passos acordados na reunião. */
export type ReuniaoProximosPassos = ItemAcionavel[];

/** Cadências válidas (whitelist do `tipoCadencia`). */
export const CADENCIAS_REUNIAO = [
  { value: "primeira", label: "Primeira reunião" },
  { value: "trimestral", label: "Trimestral" },
  { value: "revisao-anual", label: "Revisão anual" },
  { value: "extraordinaria", label: "Extraordinária" },
  { value: "outra", label: "Outra" },
] as const;

export type TipoCadencia = (typeof CADENCIAS_REUNIAO)[number]["value"];

/** Rótulo legível de uma cadência (ou a própria string se desconhecida). */
export function rotuloCadencia(value: string | null | undefined): string | null {
  if (!value) return null;
  return CADENCIAS_REUNIAO.find((c) => c.value === value)?.label ?? value;
}
