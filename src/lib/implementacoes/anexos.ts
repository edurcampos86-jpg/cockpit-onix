/**
 * Regras e helpers compartilhados dos anexos de uma sugestão de Implementação.
 *
 * A fonte da verdade dos limites é o SERVIDOR (Server Action). As mesmas
 * constantes são reusadas no cliente só como dica de UX — o `accept` do HTML e
 * a checagem no browser podem ser burlados, então tudo é revalidado na action.
 *
 * Módulo puro (sem imports server-only): pode ser importado por client e server.
 */

// Limpeza de anexos no B2:
// - removerAnexo() já apaga o objeto no B2 antes da linha.
// - Delete de Implementacao (quando existir uma action de delete): buscar as b2Key
//   dos anexos e apagar no B2 via deleteContrato() ANTES do delete. O CASCADE do
//   banco limpa as linhas, não o bucket.

export const MAX_ANEXOS = 5;
export const MAX_ANEXO_BYTES = 10 * 1024 * 1024; // 10 MB
export const ANEXO_ACCEPT = "image/*,application/pdf";

/** Aceita qualquer imagem ou PDF; rejeita o resto. */
export function tipoAnexoPermitido(contentType: string): boolean {
  return contentType.startsWith("image/") || contentType === "application/pdf";
}

/** Extensão canônica a partir do content-type (usada pra montar a key no B2). */
export function extFromContentType(contentType: string): string {
  switch (contentType) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/gif":
      return "gif";
    case "image/webp":
      return "webp";
    case "image/heic":
      return "heic";
    case "application/pdf":
      return "pdf";
    default:
      return "bin";
  }
}

/**
 * Content-Type a partir da extensão da key no B2. Usado pela rota legada de
 * print (printUrl não guarda content-type). Inclui PDF — antes caía em
 * octet-stream. Para anexos novos preferimos o contentType salvo na linha.
 */
export function mimeFromKey(key: string): string {
  const ext = key.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "heic":
      return "image/heic";
    case "pdf":
      return "application/pdf";
    default:
      return "application/octet-stream";
  }
}

/**
 * Sanitiza o nome de arquivo vindo do cliente: tira caminho, troca o que não
 * for [\w.-] por "_", colapsa repetições e limita o tamanho. Nunca confiar no
 * nome original (path traversal / header injection no Content-Disposition).
 */
export function sanitizeNomeArquivo(nome: string): string {
  const base = nome.split(/[\\/]/).pop() ?? nome;
  const clean = base
    .replace(/[^\w.\-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[_.]+|_+$/g, "");
  return (clean || "arquivo").slice(0, 120);
}
