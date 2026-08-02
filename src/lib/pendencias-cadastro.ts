/**
 * Regra de PENDÊNCIA DE CADASTRO do /time — PURA (sem server-only, sem prisma),
 * para poder ser testada sem banco e importada de qualquer lado.
 *
 * Existe separada porque a MESMA regra decide três coisas: os badges de cada
 * card, o contador do topo e o filtro. Se as três tivessem cópias próprias, o
 * número do topo passaria a não bater com a lista logo abaixo — e ninguém
 * descobriria olhando um lado só.
 */

import { isEmailCorporativo } from "./dominios-corporativos";

/**
 * Famílias de cargo que atendem cliente no BTG e, portanto, DEVEM ter
 * `codigoAssessorBtg` preenchido.
 *
 * A lista é `socio` + `assessor_investimentos`, e não só "assessor", porque é
 * o que os dados dizem: dos 12 assessores da Base BTG que constam de
 * recover-team-data.ts, os 12 estão cadastrados como `socio`. Só uma pessoa no
 * /time tem `assessor_investimentos`, e ela não aparece na Base BTG. Filtrar
 * por "assessor" acusaria justamente quem não tem carteira e deixaria passar
 * os 12 que têm.
 *
 * Fora da lista ficam imobiliária, corretora, qualidade e administrativo — que
 * não têm vínculo com o BTG e não precisam ter (confirmado pelo Eduardo). Para
 * essas, a ausência de código é o estado correto, não uma pendência.
 */
export const CARGOS_COM_VINCULO_BTG: readonly string[] = [
  "socio",
  "assessor_investimentos",
];

/** Esta pessoa deveria ter código de assessor no BTG? */
export function deveTerCodigoBtg(cargoFamilia: string | null | undefined): boolean {
  return CARGOS_COM_VINCULO_BTG.includes(cargoFamilia ?? "");
}

/* ──────────────────────────────────────────────────────────────────────────
   PENDÊNCIAS DE CADASTRO
   ────────────────────────────────────────────────────────────────────────── */

/**
 * As três pendências que a listagem já marca por card, num só lugar.
 *
 * Definidas aqui, e não na página, porque a MESMA regra decide três coisas: o
 * badge no card, o contador do topo e o filtro. Duplicar a condição em três
 * lugares é como elas passam a divergir.
 *
 * `arquivado` nunca é pendência: quem saiu não vai preencher telefone nem
 * migrar e-mail. É o mesmo critério dos badges (todos checam !isArquivado).
 */
export type PendenciasCadastro = {
  semCodigoBtg: boolean;
  semTelefone: boolean;
  emailPessoal: boolean;
};

export function pendenciasDe(p: {
  status: string;
  cargoFamilia: string;
  codigoAssessorBtg: string | null;
  telefone?: string | null;
  email?: string | null;
  semTelefone?: boolean;
  emailPessoal?: boolean;
}): PendenciasCadastro {
  if (p.status === "arquivado") {
    return { semCodigoBtg: false, semTelefone: false, emailPessoal: false };
  }
  return {
    semCodigoBtg: !p.codigoAssessorBtg && deveTerCodigoBtg(p.cargoFamilia),
    // Aceita a linha já projetada por listPessoas (booleanos) ou a linha crua.
    semTelefone: p.semTelefone ?? !p.telefone,
    emailPessoal: p.emailPessoal ?? !isEmailCorporativo(p.email),
  };
}

export function temPendencia(p: Parameters<typeof pendenciasDe>[0]): boolean {
  const d = pendenciasDe(p);
  return d.semCodigoBtg || d.semTelefone || d.emailPessoal;
}

/**
 * Tipos de pendência que o filtro da listagem aceita.
 *
 * "todas" existe porque o card mostra um total além da quebra; os três
 * específicos existem porque uma fila única com 17 telefones e 12 códigos
 * misturados não é fila, é ruído.
 */
export const TIPOS_PENDENCIA = [
  { value: "1", label: "todas as pendências" },
  { value: "codigo", label: "sem código BTG" },
  { value: "telefone", label: "sem telefone" },
  { value: "email", label: "e-mail pessoal" },
] as const;

export type TipoPendencia = (typeof TIPOS_PENDENCIA)[number]["value"];

export function isTipoPendencia(v: string | undefined): v is TipoPendencia {
  return TIPOS_PENDENCIA.some((t) => t.value === v);
}

/** A pessoa entra no recorte pedido? */
export function casaPendencia(
  p: Parameters<typeof pendenciasDe>[0],
  tipo: TipoPendencia,
): boolean {
  const d = pendenciasDe(p);
  switch (tipo) {
    case "codigo":
      return d.semCodigoBtg;
    case "telefone":
      return d.semTelefone;
    case "email":
      return d.emailPessoal;
    default:
      return d.semCodigoBtg || d.semTelefone || d.emailPessoal;
  }
}

