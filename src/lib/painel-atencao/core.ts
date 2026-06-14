/**
 * Painel de Atenção ao Cliente — núcleo PURO da classificação de estado.
 *
 * Sem prisma, sem `server-only`: importável tanto no client (futura UI) quanto
 * no server (service + scripts de validação read-only). A régua de cadência
 * ABC vem do motor ÚNICO `cadencia-core` (NÃO reescrever A30/B90/C180 aqui —
 * `diasCadencia` é a fonte de verdade).
 *
 * As 2 datas direcionais (eu↔cliente) são derivadas de `Mensagem.sentAt` por
 * `fromMe`, agrupado via `Conversa.clienteId` (ver service.ts). Aqui entra só
 * a lógica de estado a partir dessas 2 datas.
 */
import { diasCadencia } from "../cadencia-core";

const MS_DIA = 24 * 60 * 60 * 1000;

export type EstadoAtencao = "em-dia" | "no-vacuo" | "esquecido" | "sem-contato";

export interface EntradaAtencao {
  /** MAX(sentAt) das mensagens fromMe=true do cliente; null = nunca falamos. */
  ultimoEuFalei: Date | null;
  /** MAX(sentAt) das mensagens fromMe=false; null = cliente nunca falou. */
  ultimoClienteFalou: Date | null;
  /** Classe ABC (`ClienteBackoffice.classificacao`). Vazio cai em "C" no motor. */
  classificacao: string | null | undefined;
  /** Limiar de vácuo em dias (tunável via Config DB `LIMIAR_VACUO_DIAS`). */
  limiarVacuoDias: number;
  /** Epoch ms de referência (default `Date.now()`). */
  now?: number;
}

export interface ResultadoAtencao {
  tier: string; // "A" | "B" | "C" (normalizado; "C" se vazio)
  estado: EstadoAtencao;
  /** Dias desde o último contato em QUALQUER direção; null se sem contato. */
  diasDesdeQualquerContato: number | null;
  /** Dias desde a nossa última mensagem quando ela é a mais recente; senão null. */
  diasNoVacuo: number | null;
  cadenciaDias: number; // régua da classe (30/90/180)
}

function diasDesde(maisRecente: Date, now: number): number {
  return Math.floor((now - maisRecente.getTime()) / MS_DIA);
}

/**
 * Classifica o estado de atenção de UM cliente a partir das 2 datas direcionais.
 *
 * Regras (PRIORIDADE no-vacuo > esquecido):
 *   sem-contato → 0 mensagem ingerida (ambas as datas null).
 *   no-vacuo    → a última msg foi NOSSA (fromMe) e está pendurada há > limiar
 *                 (o relógio conta da nossa última mensagem, a mais recente).
 *   esquecido   → dias desde QUALQUER contato > cadência da classe (motor).
 *   em-dia      → contato dentro da cadência e não no-vacuo.
 */
export function classificarEstadoAtencao(e: EntradaAtencao): ResultadoAtencao {
  const now = e.now ?? Date.now();
  const tier = (e.classificacao || "C").toUpperCase();
  const cadenciaDias = diasCadencia(tier);

  const { ultimoEuFalei, ultimoClienteFalou } = e;

  // sem-contato: nenhuma mensagem ingerida em nenhuma direção.
  if (!ultimoEuFalei && !ultimoClienteFalou) {
    return {
      tier,
      estado: "sem-contato",
      diasDesdeQualquerContato: null,
      diasNoVacuo: null,
      cadenciaDias,
    };
  }

  // A última mensagem da timeline foi nossa?
  const ultimaFoiMinha =
    !!ultimoEuFalei &&
    (!ultimoClienteFalou ||
      ultimoEuFalei.getTime() > ultimoClienteFalou.getTime());

  // Contato mais recente em qualquer direção (≥1 das datas é não-null aqui;
  // timestamps reais são > 0, então 0 é sentinela seguro pra "ausente").
  const tMaisRecente = Math.max(
    ultimoEuFalei?.getTime() ?? 0,
    ultimoClienteFalou?.getTime() ?? 0,
  );
  const diasDesdeQualquerContato = diasDesde(new Date(tMaisRecente), now);

  // Vácuo: nós falamos por último e o cliente não respondeu há > limiar.
  const diasNoVacuo =
    ultimaFoiMinha && ultimoEuFalei ? diasDesde(ultimoEuFalei, now) : null;

  let estado: EstadoAtencao;
  if (diasNoVacuo !== null && diasNoVacuo > e.limiarVacuoDias) {
    estado = "no-vacuo";
  } else if (diasDesdeQualquerContato > cadenciaDias) {
    estado = "esquecido";
  } else {
    estado = "em-dia";
  }

  return { tier, estado, diasDesdeQualquerContato, diasNoVacuo, cadenciaDias };
}
