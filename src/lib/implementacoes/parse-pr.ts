/**
 * Leitura do que o usuário digita/cola no campo "PR" de uma sugestão.
 *
 * Módulo puro (sem imports server-only nem "use client"): usado pela célula da
 * tabela e testável isoladamente. O servidor revalida o número de qualquer jeito
 * — isto aqui é a camada de conveniência, não a de confiança.
 */

/**
 * Aceita "123", "#123" ou a URL inteira do PR colada do navegador.
 *
 * Colar a URL é o gesto natural de quem acabou de mergear — ela está no
 * clipboard. Exigir que o número seja digitado à mão transformaria "fechar o
 * loop" em trabalho, e trabalho opcional não é feito.
 *
 * `/issues/` NÃO casa de propósito: vincular uma issue como se fosse o PR
 * estragaria em silêncio a métrica de ideia → entrega.
 *
 * Devolve também a URL quando o que veio foi uma URL, para o link da célula.
 */
export function parsePrEntrada(bruto: string): {
  numero: number | null;
  url: string | null;
} {
  const t = bruto.trim();
  if (!t) return { numero: null, url: null };

  const comoUrl = t.match(/^https?:\/\/\S*\/pull\/(\d+)(?:\D.*)?$/i);
  if (comoUrl) return { numero: Number(comoUrl[1]), url: t };

  const soNumero = t.match(/^#?(\d+)$/);
  if (soNumero) return { numero: Number(soNumero[1]), url: null };

  return { numero: null, url: null };
}
