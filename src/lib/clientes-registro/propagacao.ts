/**
 * Regra da propagação de contato por grupo — módulo PURO.
 *
 * A regra inteira, em duas linhas:
 *
 *   contato registrado NO GRUPO      → propaga para os membros com viaGrupo=true
 *   contato registrado NO INDIVÍDUO  → não propaga para ninguém
 *
 * Mora aqui, sem prisma e sem `server-only`, porque é a única parte deste PR
 * que escreve em MAIS DE UMA conta a partir de um clique só. Errar o conjunto
 * de destinos não dá erro: dá data de contato movida em cliente com quem
 * ninguém falou — e a cadência 12-4-2 passa a mentir em silêncio, para baixo,
 * que é o lado que não gera reclamação.
 *
 * Testável isolado é o ponto: a rota faz I/O, esta função decide.
 */

/** Membro do grupo, como a rota o lê do banco. */
export type MembroGrupo = {
  clienteId: string;
  /** Recebe a propagação? Coluna `ClienteGrupoMembro.viaGrupo`. */
  viaGrupo: boolean;
};

/** Onde o contato foi registrado. */
export type EscopoContato =
  /** No grupo inteiro — o caso que propaga. */
  | { tipo: "grupo"; grupoId: string; membros: readonly MembroGrupo[] }
  /** Numa conta só — nunca propaga, nem para o grupo dela. */
  | { tipo: "individual"; clienteId: string };

/** Uma conta que vai receber a escrita, e por quê. */
export type DestinoContato = {
  clienteId: string;
  /** "proprio" = falaram com ele. "grupo" = efeito de terem falado com o grupo. */
  origem: "proprio" | "grupo";
  /** Preenchido só em origem "grupo" — qual grupo propagou. */
  grupoId?: string;
};

/**
 * Quem recebe a escrita de contato.
 *
 * Contato individual devolve UM destino, sempre — mesmo que a conta pertença a
 * um grupo. Essa é a metade da regra que é fácil de implementar errado, porque
 * "ele está no grupo, então propaga" parece razoável e é justamente o que o
 * Eduardo não quer: registrar uma ligação para o filho não pode zerar o alerta
 * de vácuo do pai.
 *
 * Contato no grupo devolve só os membros com `viaGrupo` — nunca o grupo em si,
 * que não é cliente e não tem data de contato.
 *
 * Ordem estável (pela ordem dos membros) e sem duplicatas: a rota escreve
 * dentro de uma transação e um mesmo clienteId duas vezes geraria duas linhas
 * de histórico para o mesmo evento.
 */
export function destinosDoContato(escopo: EscopoContato): DestinoContato[] {
  if (escopo.tipo === "individual") {
    return [{ clienteId: escopo.clienteId, origem: "proprio" }];
  }

  const vistos = new Set<string>();
  const destinos: DestinoContato[] = [];

  for (const m of escopo.membros) {
    if (!m.viaGrupo) continue;
    if (vistos.has(m.clienteId)) continue;
    vistos.add(m.clienteId);
    destinos.push({ clienteId: m.clienteId, origem: "grupo", grupoId: escopo.grupoId });
  }

  return destinos;
}

/**
 * A data de contato regride?
 *
 * `ultimoContatoAt` só anda para a FRENTE. Registrar hoje uma ligação de duas
 * semanas atrás não pode apagar o fato de que houve contato ontem — e é um
 * caso real, porque o registro manual existe justamente para lançar o que ficou
 * para trás.
 *
 * `null` no atual = nunca houve contato: qualquer data é avanço.
 */
export function avancaUltimoContato(
  atual: Date | null | undefined,
  novo: Date,
): boolean {
  if (!atual) return true;
  return novo.getTime() > atual.getTime();
}
