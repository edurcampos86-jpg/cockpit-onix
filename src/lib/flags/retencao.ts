import "server-only";
import { prisma } from "@/lib/prisma";
import { getConfig } from "@/lib/config-db";
import {
  CONFIG_AUDIT_RETENCAO_DIAS_KEY,
  RETENCAO_MINIMA_DIAS,
  RETENCAO_PADRAO_DIAS,
  decidirRetencaoDias,
} from "@/lib/flags/retencao-core";

export {
  CONFIG_AUDIT_RETENCAO_DIAS_KEY,
  RETENCAO_MINIMA_DIAS,
  RETENCAO_PADRAO_DIAS,
} from "@/lib/flags/retencao-core";

/* ──────────────────────────────────────────────────────────────
 * Retenção do `ConfigAudit`.
 *
 * ── DE ONDE VEIO O NÚMERO (a pergunta que não tinha dono) ──
 * 730 dias (2 anos) foi decidido AQUI, nesta PR, na falta de um dono do
 * assunto — não veio de política de compliance, de exigência do BTG nem de
 * pedido de auditoria. Fica registrado como DEFAULT à espera de dono, não como
 * regra estabelecida.
 *
 * O raciocínio: a pergunta que esta tabela responde é "quem ligou isso, e o que
 * havia antes?", feita dias a meses depois do fato — nunca anos. Dois anos
 * cobrem com folga qualquer investigação plausível e passam de um ciclo fiscal
 * inteiro. Custo não foi critério: a tabela só cresce quando alguém vira uma
 * flag na mão, então mesmo guardar para sempre seria barato. O prazo existe
 * para a tabela ter uma política, não porque ela incomode.
 *
 * Mudável sem deploy pela chave `CONFIG_AUDIT_RETENCAO_DIAS` (Config DB), que
 * está registrada em `flags/registro.ts` e aparece na tela de flags.
 *
 * ── PISO DE 365 DIAS, EM CÓDIGO ──
 * Valor abaixo do piso é IGNORADO e o default vale. Isto é o que impede que um
 * dedo trocado (`7` no lugar de `700`) transforme uma rotina mensal e silenciosa
 * numa destruição do rastro de auditoria — o tipo de erro que só se descobre no
 * dia em que se precisa do histórico, e aí já não tem volta. Aumentar o prazo é
 * livre; encurtar abaixo de um ano exige mexer neste arquivo, com PR e revisão.
 * ────────────────────────────────────────────────────────────── */

export type ResultadoRetencao = {
  /** Dias efetivamente aplicados. */
  dias: number;
  /** Data de corte: linhas anteriores a ela foram apagadas. */
  corte: string;
  apagados: number;
  /** Valor da Config foi recusado por ficar abaixo do piso? */
  pisoAplicado: boolean;
  /** `false` = rodou em modo relatório e nada foi apagado. */
  apagou: boolean;
  /** Quantas linhas SERIAM apagadas (no modo relatório). */
  candidatos: number;
};

/**
 * Dias de retenção efetivos. Config inválida (não numérica, zero, negativa) ou
 * abaixo do piso cai no default — nunca num valor perigoso.
 */
export async function resolverRetencaoDias(): Promise<{ dias: number; pisoAplicado: boolean }> {
  const bruto = await getConfig(CONFIG_AUDIT_RETENCAO_DIAS_KEY);
  const decisao = decidirRetencaoDias(bruto);
  if (decisao.pisoAplicado) {
    console.warn(
      `[config-audit-retencao] ${CONFIG_AUDIT_RETENCAO_DIAS_KEY}=${bruto} está abaixo do piso ` +
        `de ${RETENCAO_MINIMA_DIAS} dias — ignorado, valendo ${RETENCAO_PADRAO_DIAS}.`,
    );
  }
  return decisao;
}

/**
 * Apaga (ou só conta, com `apagar: false`) as linhas de `ConfigAudit` mais
 * velhas que a retenção.
 *
 * `agora` é injetável para o teste não depender do relógio.
 */
export async function aplicarRetencaoConfigAudit(
  opcoes: { apagar?: boolean; agora?: Date } = {},
): Promise<ResultadoRetencao> {
  const { apagar = true, agora = new Date() } = opcoes;
  const { dias, pisoAplicado } = await resolverRetencaoDias();

  const corte = new Date(agora.getTime() - dias * 24 * 60 * 60 * 1000);
  const where = { quando: { lt: corte } };

  const candidatos = await prisma.configAudit.count({ where });
  const apagados = apagar && candidatos > 0
    ? (await prisma.configAudit.deleteMany({ where })).count
    : 0;

  return {
    dias,
    corte: corte.toISOString(),
    apagados,
    pisoAplicado,
    apagou: apagar,
    candidatos,
  };
}
