/* ──────────────────────────────────────────────────────────────
 * Os textos do ensaio. Módulo PURO, sem React — para o texto poder ser
 * testado sem montar tela.
 *
 * ── A REGRA QUE ORGANIZA ESTE ARQUIVO ───────────────────────────────────
 * Nenhuma frase aqui cita número que o motor não devolva. Parece óbvio e não
 * é: a primeira versão deste texto dizia "340 contratos perdem o prêmio
 * atual" — número que o motor não tinha como produzir, porque `carregarEstado`
 * não lia do banco nenhum dos campos sobrescrevíveis.
 *
 * Um aviso vago ("dá para desfazer") é ruim. Um número inventado é pior: é
 * auditável, e falso. Por isso o aviso de sobrescrita nasceu qualitativo,
 * dizendo em voz alta que o ensaio NÃO sabia quantos.
 *
 * ── O QUE MUDOU, E POR QUE O NÚMERO AGORA É LEGÍTIMO ────────────────────
 * `carregarEstado` passou a trazer os cinco sobrescrevíveis (`fimVigencia`,
 * `premio`, `comissao`, `atendenteCorretora`, `assessorCge`), e o plano devolve
 * `camposNaoCobertos`. A regra do arquivo não mudou — o motor é que passou a
 * saber a resposta.
 *
 * E a pergunta que o número responde mudou junto. O update deixou de escrever
 * coluna que o relatório não trouxe, então `camposNaoCobertos` não é mais
 * "quanto vai ser apagado": é "quanto a base tem que este perfil não cobre".
 * Chamá-lo de perda seria a mesma família de erro do número inventado — a
 * frase precisa dizer o que o motor faz HOJE.
 *
 * Os parâmetros de cada função são exatamente os campos de
 * `ResultadoImportacao` — se um número não está no tipo, não entra na frase.
 * ────────────────────────────────────────────────────────────── */

/** Rótulo e ajuda de cada número do ensaio. */
export type ExplicacaoCampo = {
  readonly rotulo: string;
  readonly ajuda: string;
};

export const EXPLICACOES: Readonly<Record<string, ExplicacaoCampo>> = {
  linhasLidas: {
    rotulo: "Linhas do relatório",
    ajuda:
      "Cada produto é uma linha. Cabeçalho e linhas em branco não entram na conta, então o número pode ser menor do que o que o Excel mostra.",
  },
  historicoPreservado: {
    rotulo: "Linhas que tentariam mudar contrato já encerrado",
    ajuda:
      "Contrato cancelado, encerrado ou recusado não muda mais de situação. A linha do relatório foi descartada e o contrato ficou como está.",
  },
  ignoradasPorAntiguidade: {
    rotulo: "Linhas de relatório mais antigo do que o gravado",
    ajuda:
      "Não substituem o que já está gravado. Contratos que ainda não existiam na base continuam sendo criados.",
  },
  rotulosNaoMapeados: {
    // "Palavras não reconhecidas", sem qualificação, prometia todas — e cobre
    // só as do dicionário do perfil. Produto e situação fora do catálogo
    // morrem antes, dentro de `montarRegistro`, e saem em `rejeitadas[].motivo`.
    rotulo: "Palavras não reconhecidas no perfil",
    ajuda:
      "Contadas por palavra distinta, não por linha. Cada uma vem com quantas linhas afetou.",
  },
  duplicadasNoLote: {
    rotulo: "Linhas repetidas dentro do próprio arquivo",
    ajuda: "Mesma apólice, mesmo parceiro e mesmo produto em duas linhas. Vale a última.",
  },
  amostra: {
    rotulo: "Primeiras 5 linhas aproveitadas",
    ajuda: "Só linhas que entrariam. Se nada for aproveitado, não há amostra.",
  },
  grafiasAtendente: {
    rotulo: "Nomes de atendente distintos",
    ajuda:
      "Cada grafia diferente conta uma vez. Duas grafias da mesma pessoa aparecem como duas.",
  },
  avisos: {
    rotulo: "Observações da leitura",
    ajuda:
      "Leia antes de gravar: algumas mudam o dado. Coluna com nome repetido, por exemplo, faz a última sobrescrever a primeira em silêncio.",
  },
  loteImportacao: {
    rotulo: "Código deste envio",
    ajuda:
      "Fica marcado em cada contrato gravado — nos clientes, não. No ensaio o código aparece, mas nada foi gravado com ele.",
  },
  interrompido: {
    rotulo: "Gravação interrompida",
    ajuda:
      "Reenviar o mesmo arquivo não duplica nada, mas reprocessa tudo do zero e os contratos do envio anterior passam a ter o código do novo.",
  },
};

/* ── Competência ──────────────────────────────────────────────────────── */

export const COMPETENCIA_DO_ARQUIVO = {
  titulo: "Mês do relatório: vem do arquivo.",
  corpo:
    "Este perfil lê o mês em cada linha, então o relatório pode misturar meses. Linha sem esse campo preenchido é recusada — não há mês do lote para cobrir a falta.",
} as const;

export const COMPETENCIA_A_MAO = {
  titulo: "Mês do relatório: informado à mão.",
  mascara: "AAAA-MM",
  exemplo: "2026-08",
  corpo:
    "Este perfil não lê o mês do arquivo. O valor digitado vale para o relatório inteiro e fica gravado em cada contrato — é ele que impede um arquivo antigo de sobrescrever dado mais novo na próxima importação.",
} as const;

export function avisoDeAntiguidade(quantas: number): string {
  return (
    `${quantas} ${quantas === 1 ? "linha é" : "linhas são"} de um relatório mais antigo do que ` +
    "o que já está gravado e não vão substituí-lo. Os contratos que ainda não existem na base " +
    "continuam sendo criados normalmente — este relatório completa a base, só não reescreve o " +
    "que é mais novo."
  );
}

/* ── Sobrescrita ──────────────────────────────────────────────────────── */

/** Como cada campo sobrescrevível se chama para quem lê a tela. */
const NOME_DO_CAMPO: Readonly<Record<string, string>> = {
  fimVigencia: "fim de vigência",
  premio: "prêmio",
  comissao: "comissão",
  atendenteCorretora: "atendente",
  assessorCge: "CGE",
};

/**
 * O que o relatório sobrescreve nos contratos que já existem.
 *
 * Duas frases, e a segunda só aparece quando há o que dizer. A primeira é o
 * que continua valendo: célula em branco numa coluna MAPEADA é a fonte
 * afirmando "está vazio", e apaga. A segunda é o que a trava passou a
 * garantir: coluna que o perfil não mapeia não é afirmação nenhuma, e não
 * toca no que está gravado.
 *
 * A contagem é por CAMPO e não somada: "37 fins de vigência e 4 comissões" diz
 * onde o perfil está furado; "41 valores" não diz nada acionável.
 */
export function avisoDeSobrescrita(
  contratosAAtualizar: number,
  camposNaoCobertos: readonly { readonly campo: string; readonly contratos: number }[] = [],
): string {
  const base =
    `Atualizar sobrescreve. Nos ${contratosAAtualizar.toLocaleString("pt-BR")} contratos que ` +
    "serão atualizados, célula em branco numa coluna que o perfil mapeia apaga o que está " +
    "gravado — prêmio, comissão, fim de vigência, atendente e CGE.";

  if (camposNaoCobertos.length === 0) return base;

  // Só entram os campos que o motor devolveu: nada de listar os cinco e
  // escrever zero ao lado dos que não aparecem. Zero que ninguém contou é a
  // mesma invenção que esta regra existe para impedir.
  const lista = camposNaoCobertos
    .map((c) => `${c.contratos.toLocaleString("pt-BR")} ${NOME_DO_CAMPO[c.campo] ?? c.campo}`)
    .join(", ");

  return (
    `${base} Colunas que este perfil NÃO traz ficam como estão: ${lista}. ` +
    "Esses valores são preservados — mas se você esperava que o relatório os " +
    "atualizasse, o mapeamento do perfil está incompleto."
  );
}

/* ── Erros (a tela mostra falha) ──────────────────────────────────────── */

export const ERROS = {
  perfilNaoEncontrado: "O perfil selecionado não existe mais. Atualize a página e escolha outro.",
  // A mensagem de "outra empresa" é interpolada com o nome no servidor; a tela
  // exibe a do servidor, não um texto fixo.
  perfilDeOutraEmpresa: (empresa: string) =>
    `Este perfil é da ${empresa}. Ler a base da Corretora com ele faria as colunas caírem no lugar errado por coincidência de nome.`,
  // NÃO mandar para "Configurações › Perfis de importação": essa tela não
  // existe. Não há UI nem rota de CRUD para `PerfilImportacao` em `src/app/**`
  // — o modelo só aparece na rota de import. Endereço inventado é da mesma
  // família do número inventado: auditável, e falso.
  perfilInativo:
    "Este perfil está desativado e não dá para usá-lo. Escolha outro na lista — reativar depende de quem administra os perfis.",
  arquivoGrande: (limiteMb: number, tamanhoMb: number) =>
    `O limite é ${limiteMb} MB e este arquivo tem ${tamanhoMb} MB. Em Excel, salvar só a aba do relatório costuma resolver; se não, divida em dois envios.`,
  conexaoPerdida:
    "A conexão caiu durante a gravação e parte dos contratos já entrou. Envie o mesmo arquivo de novo: nada será duplicado, mas o arquivo é reprocessado inteiro.",
  // Distinta da de cima de propósito: usar a mensagem de gravação num erro de
  // LEITURA anuncia gravação que não houve, e faz o operador reenviar o
  // arquivo sem necessidade. Sondagem e ensaio não escrevem nada.
  leituraFalhou:
    "A conexão caiu antes de a leitura terminar. Nada foi gravado — o ensaio não escreve. Tente de novo.",
} as const;

/* ── Estados vazios (o ensaio rodou; não é falha) ─────────────────────── */

export type EstadoVazio = { readonly titulo: string; readonly corpo: string };

export function nenhumaLinhaAproveitada(linhasLidas: number): EstadoVazio {
  return {
    titulo: "Nenhuma linha aproveitada.",
    corpo:
      `${linhasLidas === 1 ? "A 1 linha foi lida" : `As ${linhasLidas.toLocaleString("pt-BR")} linhas foram lidas`} ` +
      "e nenhuma passou. Veja os motivos abaixo — costuma ser a mesma palavra se repetindo.",
  };
}

/**
 * Qual estado vazio mostrar, ou `null` quando há trabalho a fazer.
 *
 * A separação entre "erro" e "estado vazio" é o que impede a tela de contar
 * duas verdades: um ensaio que leu 312 linhas e aproveitou zero NÃO falhou —
 * ele respondeu, e a resposta é que o perfil está errado.
 *
 * ── POR QUE `rejeitadas` PRECISA ENTRAR AQUI ────────────────────────────
 * Sem ele os dois cenários são o MESMO conjunto de números: tudo zero. E os
 * dois pedem ação oposta.
 *
 *   nada mudou     → o relatório já está na base, pode fechar a tela;
 *   nada passou    → o dicionário do perfil está quebrado, o mês NÃO entrou.
 *
 * A versão anterior chamava os dois de "Nada a fazer" e ainda dava a causa
 * errada ("todas caíram em contrato encerrado"). O operador fecharia a tela
 * achando a base em dia com 312 linhas recusadas atrás dele.
 */
export function estadoVazioDoEnsaio(r: {
  linhasLidas: number;
  contratosACriar: number;
  contratosAAtualizar: number;
  pessoasACriar: number;
  /** Quantas linhas o motor recusou. É o que distingue os dois vazios. */
  rejeitadas: number;
}): EstadoVazio | null {
  if (r.linhasLidas === 0) {
    return {
      titulo: "Nenhuma linha encontrada.",
      corpo:
        "O arquivo abriu, mas não havia linhas de dado. Costuma ser aba errada ou cabeçalho em outra altura.",
    };
  }
  const nadaAFazer =
    r.contratosACriar === 0 && r.contratosAAtualizar === 0 && r.pessoasACriar === 0;
  if (!nadaAFazer) return null;

  if (r.rejeitadas >= r.linhasLidas) return nenhumaLinhaAproveitada(r.linhasLidas);

  if (r.rejeitadas > 0) {
    return {
      titulo: "Nada seria gravado.",
      // "o resto já está na base como está" seria impreciso: parte do resto
      // pode ter sido barrada por contrato encerrado ou por antiguidade, casos
      // em que a base diverge do relatório de propósito.
      corpo:
        `${r.rejeitadas === 1 ? "1 das" : `${r.rejeitadas.toLocaleString("pt-BR")} das`} ` +
        `${r.linhasLidas.toLocaleString("pt-BR")} linhas ${r.rejeitadas === 1 ? "foi recusada" : "foram recusadas"}, ` +
        "e nenhuma das demais mudaria nada — contrato já encerrado, relatório mais antigo do " +
        "que o gravado ou linha repetida dentro do próprio arquivo. Veja os motivos antes de " +
        "concluir que o mês está em dia.",
    };
  }

  return {
    titulo: "Nada a fazer.",
    // A enumeração NÃO é fechada de propósito: além de contrato encerrado e
    // relatório antigo, a linha pode ter sido repetida dentro do próprio
    // arquivo (`duplicadasNoLote`). Listar duas causas e omitir a terceira
    // atribuiria causa errada a um relatório todo de duplicatas.
    corpo:
      "Nenhuma linha mudaria nada: contrato já encerrado, relatório mais antigo do que o gravado ou linha repetida dentro do próprio arquivo. Nada seria criado nem alterado.",
  };
}

/* ── Confirmação ──────────────────────────────────────────────────────── */

export function textoDaConfirmacao(r: {
  pessoasACriar: number;
  contratosACriar: number;
  contratosAAtualizar: number;
  competencia: string;
}): { titulo: string; linhas: string[] } {
  const n = (v: number) => v.toLocaleString("pt-BR");
  return {
    titulo: `Gravar ${n(r.contratosACriar + r.contratosAAtualizar)} contratos na base da Corretora?`,
    linhas: [
      `Entram ${n(r.pessoasACriar)} clientes novos e ${n(r.contratosACriar)} contratos novos.`,
      // "campo em branco" e não "campo ausente": desde a trava do update, a
      // coluna que o perfil não mapeia NÃO apaga nada. Manter a frase antiga
      // faria a confirmação avisar de um risco que o motor não corre mais —
      // aviso falso gasta a atenção que o aviso verdadeiro vai precisar.
      `${n(r.contratosAAtualizar)} contratos existentes passam a valer pelos dados deste relatório, e cada campo em branco numa coluna que o perfil mapeia apaga o valor que está gravado.`,
      "Depois de gravar, não há como voltar atrás por aqui. O caminho de volta é reimportar o relatório do mês certo.",
      `Mês do relatório: ${r.competencia}.`,
    ],
  };
}
