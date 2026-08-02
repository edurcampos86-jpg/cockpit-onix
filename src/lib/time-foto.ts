/**
 * Chave da foto de perfil no B2 — PURA, para o action de upload e a rota que
 * serve a imagem concordarem sem duplicar a regra.
 *
 * DERIVADA do id da pessoa, nunca sorteada nem vinda do cliente. Três
 * consequências, todas desejadas:
 *
 *  - não há como escrever por cima da foto de outra pessoa;
 *  - trocar a foto SOBRESCREVE a anterior, em vez de acumular lixo no bucket;
 *  - a rota que serve a imagem não precisa de nenhuma coluna nova para saber
 *    onde procurar.
 */
export function chaveFotoPessoa(pessoaId: string): string {
  return `time/foto/${pessoaId}`;
}

/**
 * Content-Type a partir dos primeiros bytes do arquivo.
 *
 * O B2 guarda o ContentType no objeto, mas `downloadContrato` devolve só o
 * Buffer — ler o cabeçalho custaria uma chamada HEAD extra por imagem. Os
 * três formatos aceitos têm assinatura fixa nos primeiros bytes, então sai de
 * graça.
 *
 * Devolver "image/jpeg" para tudo (o atalho óbvio) faz PNG com transparência
 * renderizar errado em parte dos browsers e quebra download/salvar-como.
 */
export function tipoImagem(buffer: Buffer): string {
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return "image/png";
  }
  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  // Desconhecido: octet-stream faz o browser baixar em vez de tentar desenhar
  // lixo — falha visível em vez de silenciosa.
  return "application/octet-stream";
}
