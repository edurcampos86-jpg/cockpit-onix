/* ──────────────────────────────────────────────────────────────
 * Tipos e configuração das colunas do Círculo de Introduções (V2).
 *
 * `Indicacao` é o tipo ÚNICO do caminho V2 — importado pelo `page.tsx` e por
 * todos os componentes do board, matando a duplicação `IndicacaoView` (page) /
 * `Indicacao` (board) do caminho antigo. O caminho antigo mantém os dele,
 * intocados, atrás da flag OFF.
 *
 * Os VALORES de status ("recebida"…"perdida") são os do banco e não mudam;
 * o que a V2 troca são os rótulos visíveis (vocabulário de "introdução",
 * Bill Cates — ver spec de copy).
 * ────────────────────────────────────────────────────────────── */

import {
  UserPlus,
  Phone,
  Calendar,
  CheckCircle2,
  XCircle,
  type LucideIcon,
} from "lucide-react";

export interface Indicacao {
  id: string;
  nomeIndicado: string;
  emailIndicado: string | null;
  telefoneIndicado: string | null;
  status: string;
  valorEstimado: number | null;
  agradecimentoEnviado: boolean;
  notas: string | null;
  criadoEm: string;
  /** Vínculo com o cadastro do cliente quando convertida (rota /converter). */
  clienteConvertidoId: string | null;
  indicador: { id: string; nome: string; classificacao: string } | null;
  /** Origem quando quem indicou é PARCEIRO, e não cliente. Os dois convivem. */
  parceiro: { id: string; nome: string } | null;
}

export interface ClienteOpcao {
  id: string;
  nome: string;
  nomeCompleto?: string | null;
  apelido?: string | null;
  classificacao: string;
}

export interface ParceiroOpcao {
  id: string;
  nome: string;
}

export type StatusIndicacao =
  | "recebida"
  | "contatada"
  | "reuniao"
  | "convertida"
  | "perdida";

export interface ColunaDef {
  id: StatusIndicacao;
  /** Rótulo visível (copy V2); o valor do banco segue sendo `id`. */
  label: string;
  /** Tooltip do cabeçalho da coluna. */
  tooltip: string;
  icon: LucideIcon;
  /** Cor da etapa — SÓ no ícone e no filete superior; corpo neutro por token. */
  corIcone: string;
  corFilete: string;
  /** Empty state da coluna (quadro não vazio) — aponta a próxima ação. */
  vazio: string;
}

export const COLUNAS_V2: readonly ColunaDef[] = [
  {
    id: "recebida",
    label: "Recebidas",
    tooltip: "Introduções que chegaram e ainda esperam o primeiro contato.",
    icon: UserPlus,
    corIcone: "text-chart-2",
    corFilete: "border-t-chart-2",
    vazio: "Nenhuma introdução nova. Sábado, 7h, é a hora de alimentar esta coluna.",
  },
  {
    id: "contatada",
    label: "Contato feito",
    tooltip: "Primeira conversa iniciada — o próximo passo é um convite social.",
    icon: Phone,
    corIcone: "text-gold-dark dark:text-primary",
    corFilete: "border-t-gold-dark dark:border-t-primary",
    vazio: "Ninguém em contato. Pegue um cartão em Recebidas e mande a primeira mensagem.",
  },
  {
    id: "reuniao",
    label: "Convívio marcado",
    tooltip: "Treino, praia, mesa, teatro ou reunião com data na agenda.",
    icon: Calendar,
    corIcone: "text-chart-5",
    corFilete: "border-t-chart-5",
    vazio: "Nenhum convívio na agenda. Convide alguém já contatado: treino, praia, mesa ou teatro.",
  },
  {
    id: "convertida",
    label: "Cliente Onix",
    tooltip: "Entrou para o círculo. Feche o ciclo agradecendo quem apresentou.",
    icon: CheckCircle2,
    corIcone: "text-chart-3",
    corFilete: "border-t-chart-3",
    vazio: "As conversões nascem das colunas à esquerda. Siga convidando.",
  },
  {
    id: "perdida",
    label: "Esfriou",
    tooltip: "Sem avanço por agora. Relação esfriada pode ser reaquecida — nada aqui é lixeira.",
    icon: XCircle,
    corIcone: "text-destructive",
    corFilete: "border-t-destructive",
    vazio: "Nada esfriou. Convite feito é relação aquecida — continue assim.",
  },
] as const;

export function colunaDe(status: string): ColunaDef {
  return COLUNAS_V2.find((c) => c.id === status) ?? COLUNAS_V2[0];
}

/** Etapas em andamento — contam no pipeline aberto e mostram convites. */
export const STATUS_ABERTOS: readonly string[] = ["recebida", "contatada", "reuniao"];

export const moeda = (v: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(v);
