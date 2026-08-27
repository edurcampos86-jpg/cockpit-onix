/**
 * Quem recebe o alerta de um cliente — módulo PURO.
 *
 * Até 22/08/2026 todo alerta de cliente ia para o canal `#ecossistema-onix`,
 * visível ao escritório inteiro. Dois problemas nisso, e o segundo é o pior:
 * alerta que é de todo mundo não é de ninguém, e nome + conta + saldo de
 * cliente ficavam à vista de quem não atende aquela carteira.
 *
 * A partir daqui o alerta vai para o ASSESSOR responsável e para o BACKOFFICE
 * dele. O mapeamento não foi inventado — já existia no schema, montado pela
 * tela de Permissões:
 *
 *   ClienteBackoffice.assessorCge
 *     → CarteiraCge.cge          (unique, casa por valor)
 *       → Carteira
 *         → AcessoCarteira.tipo  "dono"  = o assessor
 *                                "apoia" = o backoffice daquela carteira
 *           → Pessoa.telefone    (o mesmo campo que o alerta de evasão já usa)
 *
 * A decisão de QUEM recebe mora aqui, pura e testável. A busca no banco mora em
 * `destinatarios.ts`. Errar este conjunto não dá erro: dá alerta entregue à
 * pessoa errada, ou — pior e silencioso — alerta que não chega a ninguém.
 */

/** Uma pessoa candidata a receber, como a carteira a devolve. */
export type MembroCarteira = {
  pessoaId: string;
  nome: string;
  telefone: string | null;
  /** "dono" = assessor responsável · "apoia" = backoffice da carteira. */
  tipo: string;
};

export type Destinatario = {
  pessoaId: string;
  nome: string;
  telefone: string;
  papel: "assessor" | "backoffice";
};

export type ResolucaoDestinatarios = {
  destinatarios: Destinatario[];
  /** Quem deveria receber e não tem telefone cadastrado — vira erro no log. */
  semTelefone: string[];
  /**
   * `true` quando NINGUÉM pôde ser notificado. É o caso que não pode passar em
   * silêncio: sem isto, um cliente sem carteira configurada simplesmente
   * pararia de gerar alerta e ninguém saberia que parou.
   */
  orfao: boolean;
};

/**
 * Converte os membros da carteira nos destinatários do alerta.
 *
 * Ordem estável: assessor primeiro, backoffice depois. Não é estética — é a
 * ordem em que as pessoas aparecem no log de erro, e o dono do cliente tem de
 * ser o primeiro nome ali.
 *
 * Duplicata some: a mesma pessoa pode ser dona de uma carteira e apoiar outra
 * que aponta para o mesmo CGE. Sem o dedupe ela receberia a mesma mensagem duas
 * vezes, o que treina qualquer pessoa a ignorar o canal.
 */
export function resolverDestinatarios(
  membros: readonly MembroCarteira[],
): ResolucaoDestinatarios {
  const destinatarios: Destinatario[] = [];
  const semTelefone: string[] = [];
  const vistos = new Set<string>();

  const ordenados = [
    ...membros.filter((m) => m.tipo === "dono"),
    ...membros.filter((m) => m.tipo !== "dono"),
  ];

  for (const m of ordenados) {
    if (vistos.has(m.pessoaId)) continue;
    vistos.add(m.pessoaId);

    const tel = m.telefone?.trim();
    if (!tel) {
      semTelefone.push(m.nome);
      continue;
    }
    destinatarios.push({
      pessoaId: m.pessoaId,
      nome: m.nome,
      telefone: tel,
      papel: m.tipo === "dono" ? "assessor" : "backoffice",
    });
  }

  return { destinatarios, semTelefone, orfao: destinatarios.length === 0 };
}
