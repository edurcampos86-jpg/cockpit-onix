/* ──────────────────────────────────────────────────────────────
 * Os textos do ensaio. Módulo PURO, sem React — para o texto poder ser
 * testado sem montar tela.
 *
 * ── A REGRA QUE ORGANIZA ESTE ARQUIVO ───────────────────────────────────
 * Nenhuma frase aqui cita número que o motor não devolva. Parece óbvio e não
 * é: a primeira versão deste texto dizia "340 contratos perdem o prêmio
 * atual" — número que o motor NÃO tem como produzir, porque `carregarEstado`
 * (`executar-importacao.ts`) traz do contrato existente apenas `id`, `status`,
 * `parceiro`, `numeroContrato`, `tipoProduto` e `importadoEm`. Prêmio,
 * comissão, fim de vigência, atendente e CGE nunca são lidos do banco, e
 * nenhuma comparação entre gravado e arquivo existe no código.
 *
 * Um aviso vago ("dá para desfazer") é ruim. Um número inventado é pior: é
 * auditável, e falso. Por isso o aviso de sobrescrita é qualitativo e diz, em
 * voz alta, que o ensaio NÃO sabe quantos.
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

/**
 * O aviso é qualitativo de propósito. Ver o comentário do topo do arquivo:
 * o motor não lê do banco os campos que seriam apagados, então qualquer
 * número aqui seria invenção.
 */
export function avisoDeSobrescrita(contratosAAtualizar: number): string {
  return (
    `Atualizar sobrescreve. Nos ${contratosAAtualizar.toLocaleString("pt-BR")} contratos que ` +
    "serão atualizados, cada campo em branco no relatório apaga o que está gravado — prêmio, " +
    "comissão, fim de vigência, atendente e CGE. O ensaio não diz quantos: ele não lê os " +
    "valores atuais."
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
} as const;

/* ── Estados vazios (o ensaio rodou; não é falha) ─────────────────────── */

export type EstadoVazio = { readonly titulo: string; readonly corpo: string };

export function nenhumaLinhaAproveitada(linhasLidas: number): EstadoVazio {
  return {
    titulo: "Nenhuma linha aproveitada.",
    corpo: `As ${linhasLidas.toLocaleString("pt-BR")} linhas foram lidas e nenhuma passou. Veja os motivos abaixo — costuma ser a mesma palavra se repetindo.`,
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
      corpo: `${r.rejeitadas.toLocaleString("pt-BR")} das ${r.linhasLidas.toLocaleString("pt-BR")} linhas foram recusadas e o resto já está na base como está. Veja os motivos antes de concluir que o mês está em dia.`,
    };
  }

  return {
    titulo: "Nada a fazer.",
    corpo:
      "Todas as linhas caíram em contrato já encerrado ou em relatório mais antigo do que o gravado. Nada seria criado nem alterado.",
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
      `${n(r.contratosAAtualizar)} contratos existentes passam a valer pelos dados deste relatório, e cada campo em branco no arquivo apaga o valor que está gravado.`,
      "Depois de gravar, não há como voltar atrás por aqui. O caminho de volta é reimportar o relatório do mês certo.",
      `Mês do relatório: ${r.competencia}.`,
    ],
  };
}
