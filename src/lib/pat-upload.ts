/**
 * Teto do PDF do PAT — um número, um lugar.
 *
 * Existe como módulo próprio (e não como constante dentro da action) por dois
 * motivos:
 *
 * 1. Arquivo `"use server"` só pode exportar função async. Constante exportada
 *    de lá quebra o build.
 * 2. O rótulo da tela e a guarda do servidor precisam citar o MESMO número.
 *    Enquanto estavam separados, o servidor media 10 MiB (10.485.760) e a tela
 *    prometia "10MB" — 5% de diferença que ninguém via, e que fazia um arquivo
 *    de 10,2 MB ser recusado por uma tela que dizia aceitá-lo.
 *
 * A unidade é MB DECIMAL (10^6), de propósito: é o que o Windows, o Drive e o
 * Finder mostram. Medir em MiB e rotular em MB foi a origem da divergência.
 *
 * 20 MB cabe com folga nas camadas acima:
 *   - body de Server Action do Next: 55 MB (`next.config.ts`)
 *   - request da API Anthropic: 32 MB — 20 MB viram ~26,7 MB em base64
 */
export const MAX_PDF_BYTES = 20_000_000;

/** Como o teto é escrito para gente ler. Sempre junto de `MAX_PDF_BYTES`. */
export const MAX_PDF_LABEL = "20 MB";

/** Tamanho em MB decimal, com vírgula — "14,4 MB". */
export function formatarMB(bytes: number): string {
  return `${(bytes / 1_000_000).toFixed(1).replace(".", ",")} MB`;
}
