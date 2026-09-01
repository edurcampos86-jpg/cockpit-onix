/**
 * Recibo de gravação — o resultado de gravar algo na ficha do cliente, dito
 * em português.
 *
 * POR QUE ESTE ARQUIVO EXISTE
 * ---------------------------
 * Até 01/09/2026 os dez pontos de gravação de `cliente-detalhe.tsx` seguiam
 * todos a mesma forma:
 *
 *     const res = await fetch(url, { ... });
 *     if (res.ok) { ...atualiza a tela... }
 *     // e nada no `else`, e nada no `catch`
 *
 * Foram contados: ZERO ramos de falha em 1.668 linhas. O efeito prático é que
 * queda de rede, sessão expirada e erro do servidor são indistinguíveis de
 * sucesso — a tela não muda, o botão volta ao normal, e quem escreveu o sonho
 * do cliente fecha a aba achando que gravou.
 *
 * É a boleta enviada sem confirmação de execução: o silêncio parece
 * fechamento, e só na conciliação se descobre que não houve.
 *
 * O QUE ESTE MÓDULO FAZ, E O QUE DELIBERADAMENTE NÃO FAZ
 * ------------------------------------------------------
 * Faz: uma chamada de gravação que NUNCA lança, e devolve ou os dados ou um
 * motivo legível. Faz: traduzir status HTTP em frase que diz o que aconteceu
 * e o que fazer em seguida.
 *
 * Não faz: repetir a chamada sozinho. Gravação repetida em silêncio esconde
 * justamente o que estamos tentando mostrar — e num POST criaria duplicata.
 * Quem decide tentar de novo é a pessoa, clicando.
 *
 * Não faz: guardar estado. Isso é do componente (`useGravacao`).
 */

export type Gravacao<T> = { ok: true; dados: T } | { ok: false; motivo: string };

/**
 * Traduz o resultado HTTP para uma frase que a pessoa entende.
 *
 * Duas regras de redação, ambas deliberadas:
 *
 * 1. Toda mensagem diz o que fazer em seguida. "Erro ao salvar" não é
 *    mensagem, é aviso de que existe um problema — quem lê continua sem saber
 *    se perdeu o texto.
 * 2. Onde o texto digitado continua na tela, a mensagem DIZ isso. É a
 *    informação que a pessoa mais precisa no segundo seguinte à falha.
 *
 * `motivoDoServidor` é o campo `error` do corpo, quando ele veio. As rotas do
 * backoffice devolvem `{ error: string }` de forma consistente; mensagens de
 * validação (400/422) são específicas e úteis, então elas passam adiante. Já
 * o 500 devolve literalmente `"Erro"` em todas as rotas da ficha — inútil de
 * repetir, por isso a mensagem genérica vence nesse caso.
 */
export function mensagemDeFalha(status: number, motivoDoServidor?: string): string {
  const doServidor = motivoDoServidor?.trim();

  // status 0 é a convenção deste módulo para "a chamada nem chegou ao servidor".
  if (status === 0) {
    return "Sem conexão com o servidor. O que você escreveu continua na tela — tente salvar de novo.";
  }

  if (status === 401) {
    return "Sua sessão expirou. Abra o Onix em outra aba para entrar de novo, volte aqui e salve — o texto continua na tela.";
  }

  if (status === 403) {
    return "Você não tem permissão para gravar isso. Nada foi alterado.";
  }

  if (status === 404) {
    return "Este cliente não está mais no seu escopo de acesso. Nada foi gravado.";
  }

  if (status === 409) {
    return "Alguém gravou este mesmo campo antes de você. Recarregue a ficha antes de salvar de novo.";
  }

  if (status === 413) {
    return "O conteúdo é grande demais para gravar de uma vez. Divida em partes menores.";
  }

  // 400 e 422 carregam validação específica ("Título obrigatório") — vale mais
  // que qualquer frase genérica que possamos escrever aqui.
  if (status === 400 || status === 422) {
    return doServidor && doServidor !== "Erro"
      ? doServidor
      : "O servidor recusou os dados enviados. Confira os campos obrigatórios.";
  }

  if (status >= 500) {
    return "O servidor não conseguiu gravar. O que você escreveu continua na tela — tente de novo em alguns segundos.";
  }

  return doServidor && doServidor !== "Erro"
    ? doServidor
    : `Não deu para gravar (código ${status}). O que você escreveu continua na tela.`;
}

/** Lê `{ error }` do corpo sem nunca lançar — corpo vazio ou não-JSON é comum em erro. */
async function motivoDoCorpo(res: Response): Promise<string | undefined> {
  try {
    const corpo: unknown = await res.json();
    if (corpo && typeof corpo === "object" && "error" in corpo) {
      const e = (corpo as { error: unknown }).error;
      if (typeof e === "string") return e;
    }
  } catch {
    // corpo vazio, HTML de proxy, JSON truncado — nada a extrair, segue com o status.
  }
  return undefined;
}

/**
 * Grava e devolve o recibo. Nunca lança: rede caída, DNS, CORS e abort viram
 * `{ ok: false }` com motivo, do mesmo jeito que um 500 — para quem chama, o
 * tratamento é um só.
 *
 * `T` é o corpo de sucesso já em JSON. Rotas DELETE que respondem sem corpo
 * caem no ramo de sucesso com `dados` indefinido — por isso o tipo devolvido
 * deve incluir `undefined` quando o chamador for um DELETE.
 */
export async function gravar<T>(url: string, init?: RequestInit): Promise<Gravacao<T>> {
  let res: Response;

  try {
    res = await fetch(url, init);
  } catch {
    return { ok: false, motivo: mensagemDeFalha(0) };
  }

  if (!res.ok) {
    return { ok: false, motivo: mensagemDeFalha(res.status, await motivoDoCorpo(res)) };
  }

  // Resposta sem corpo por contrato: 204, ou 200 com Content-Length zero.
  // Os dois DELETE da ficha caem aqui.
  const semCorpo = res.status === 204 || res.headers.get("content-length") === "0";
  if (semCorpo) return { ok: true, dados: undefined as T };

  try {
    return { ok: true, dados: (await res.json()) as T };
  } catch {
    // 200 cujo corpo não é JSON legível: proxy truncando, HTML no lugar do
    // JSON, conexão cortada no meio da resposta.
    //
    // Tratar isto como sucesso seria refazer o bug que este módulo existe para
    // matar: o botão diria "Salvo!", nenhuma faixa apareceria, e a meta nova
    // não entraria na lista. O status HTTP diz que o servidor aceitou; o corpo
    // ilegível diz que não dá para saber COM O QUÊ ele ficou. Na dúvida entre
    // afirmar sucesso e afirmar dúvida, esta ficha afirma dúvida.
    return {
      ok: false,
      motivo:
        "O servidor respondeu, mas a resposta veio incompleta — não dá para confirmar se gravou. " +
        "Recarregue a ficha para conferir antes de tentar de novo.",
    };
  }
}

/** Grava com corpo JSON — a forma de nove dos dez pontos da ficha. */
export function gravarJson<T>(
  url: string,
  method: "POST" | "PUT" | "PATCH",
  corpo: unknown,
): Promise<Gravacao<T>> {
  return gravar<T>(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  });
}

/** Apaga — DELETE sem corpo, os dois casos de metas e eventos. */
export function apagar(url: string): Promise<Gravacao<undefined>> {
  return gravar<undefined>(url, { method: "DELETE" });
}
