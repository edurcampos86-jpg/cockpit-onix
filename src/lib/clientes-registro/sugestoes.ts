/**
 * Catálogo dos destinos de sugestão — módulo PURO.
 *
 * Uma sugestão extraída da transcrição só pode cair em campo que existe nesta
 * lista. É allowlist, e isso é regra de segurança, não organização: a rota de
 * aceite escreve em campo de cliente a partir de texto que o LLM produziu, e
 * sem lista fechada um `destino: "saldo"` inventado pela extração viraria uma
 * escrita em coluna financeira.
 *
 * A régua também trava o `input_schema` da extração — o mesmo array vira o
 * `enum` que o modelo pode devolver, para o catálogo não divergir do prompt.
 */

/** Onde a sugestão cai quando aceita. */
export type DestinoSugestao =
  | "perfilEmocional"
  | "observacoes"
  | "descoberta"
  | "meta"
  | "eventoVida"
  | "tarefa";

export type CampoDestino = {
  destino: DestinoSugestao;
  /** Campo dentro do destino. Vazio quando o destino é o campo (perfilEmocional). */
  campo: string;
  /** Como aparece na tela de revisão. */
  rotulo: string;
};

/**
 * Os 14 campos que a extração pode preencher.
 *
 * `descoberta.*` são os nove campos de `PerfilDescoberta` que já existem na
 * aba Descoberta — os mesmos que o Eduardo hoje preenche à mão depois da
 * reunião, que é a razão de a transcrição existir.
 */
export const CAMPOS_DESTINO: readonly CampoDestino[] = [
  { destino: "perfilEmocional", campo: "perfilEmocional", rotulo: "Perfil emocional" },
  { destino: "observacoes", campo: "observacoes", rotulo: "Observações" },
  { destino: "descoberta", campo: "valoresVida", rotulo: "Valores de vida" },
  { destino: "descoberta", campo: "medos", rotulo: "Medos financeiros" },
  { destino: "descoberta", campo: "sonhos", rotulo: "Sonhos" },
  { destino: "descoberta", campo: "legado", rotulo: "Legado" },
  { destino: "descoberta", campo: "experienciaPrev", rotulo: "Experiência com investimentos" },
  { destino: "descoberta", campo: "linguagemPref", rotulo: "Linguagem preferida" },
  { destino: "descoberta", campo: "mentorReferencia", rotulo: "Referência que admira" },
  { destino: "descoberta", campo: "familiaSituacao", rotulo: "Situação familiar" },
  { destino: "descoberta", campo: "perguntaMagica", rotulo: "Pergunta mágica (5 anos)" },
  { destino: "meta", campo: "titulo", rotulo: "Meta de vida" },
  { destino: "eventoVida", campo: "titulo", rotulo: "Evento de vida" },
  { destino: "tarefa", campo: "titulo", rotulo: "Tarefa" },
] as const;

/** Os campos de `PerfilDescoberta` que a extração pode tocar. */
export const CAMPOS_DESCOBERTA = CAMPOS_DESTINO.filter((c) => c.destino === "descoberta").map(
  (c) => c.campo,
);

/** O par (destino, campo) existe no catálogo? */
export function destinoValido(destino: string, campo: string): boolean {
  return CAMPOS_DESTINO.some((c) => c.destino === destino && c.campo === campo);
}

/** Rótulo do par, ou `null` se o par não existe. */
export function rotuloDe(destino: string, campo: string): string | null {
  return CAMPOS_DESTINO.find((c) => c.destino === destino && c.campo === campo)?.rotulo ?? null;
}

/** Status possíveis de uma sugestão. Não existe "editada": editar e aceitar é aceitar. */
export const STATUS_SUGESTAO = ["pendente", "aceita", "descartada"] as const;
export type StatusSugestao = (typeof STATUS_SUGESTAO)[number];

export function statusValido(s: string): s is StatusSugestao {
  return (STATUS_SUGESTAO as readonly string[]).includes(s);
}

/**
 * O valor que VALE numa sugestão: o editado, se houve edição; senão o sugerido.
 *
 * Uma função só, usada pela rota de aceite e pela tela. Duas cópias divergiriam
 * exatamente no caso que importa — o revisor corrigiu o texto e a ficha gravou
 * o original do LLM.
 */
export function valorEfetivo(s: { valorSugerido: string; valorEditado?: string | null }): string {
  const editado = s.valorEditado?.trim();
  return editado ? editado : s.valorSugerido;
}
