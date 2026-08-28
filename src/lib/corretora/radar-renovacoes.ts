/**
 * O Radar de renovações — quem vence, quem já venceu, e quem não dá para saber.
 *
 * SOMENTE LEITURA. Só `SELECT` e `count`. Nenhuma escrita em caminho nenhum.
 *
 * ── O QUE ESTE MÓDULO É, E O QUE ELE AINDA NÃO É ─────────────────────────
 * Ele responde "para quem eu ligo?". Ele NÃO responde "para quem eu já
 * liguei?" — isso é registro de tratativa, exige tabela nova, e está reportado
 * como faixa vermelha. Enquanto não existir, a mesma lista reaparece toda
 * segunda-feira, que é exatamente como a planilha virou o que é hoje.
 *
 * Está escrito aqui para ninguém confundir a fila com a ferramenta.
 *
 * ── DEPENDÊNCIA DE PRODUÇÃO ──────────────────────────────────────────────
 * Este radar vive de `ContratoCorretora.fimVigencia`. Enquanto a trava do
 * update cego (PR #424) não estiver em `main`, um perfil que não mapeie a
 * coluna de fim de vigência ZERA a data de todo contrato que atualizar — e o
 * radar perde justamente a lista de quem ligar, sem avisar ninguém.
 *
 * Ligar o radar antes daquela trava é montar o alarme e desligar o sensor.
 *
 * ── AS TRÊS FAIXAS, E POR QUE SÃO TRÊS ───────────────────────────────────
 *  • ATRASADO — `fimVigencia` já passou. Não é "vencendo com pressa": é perda
 *    que já aconteceu, e por isso fica FORA da régua de antecedência. Nenhum
 *    número de dias configurado muda o fato de que a data passou.
 *  • VENCENDO — dentro da antecedência configurada PARA AQUELE PRODUTO. Auto
 *    renova diferente de vida, e consórcio diferente dos dois; uma janela
 *    única serviria mal aos três.
 *  • SEM DATA — `fimVigencia` é null. Não entra em alerta nenhum, porque não
 *    há data para comparar, e some de qualquer janela. Aparece à parte como
 *    pendência de cadastro: o radar não pode fingir que esses contratos não
 *    existem só porque não sabe quando eles vencem.
 *
 * O schema (`prisma/schema.prisma:3323-3325`) registra que `null` aqui é
 * "vigência contínua" OU "o relatório não trouxe a data", e que o sistema não
 * distingue os dois. Por isso a faixa se chama SEM DATA e não "sem fim": ela
 * descreve o que falta no cadastro, não o que é verdade sobre o contrato.
 *
 * ── NADA AQUI IMPORTA `@/lib/prisma` ─────────────────────────────────────
 * Só o TIPO, e o cliente entra por parâmetro. Mesma nota de
 * `corretora/medicoes.ts` e de `backoffice/recon-identidade.ts`.
 */
import type { PrismaClient } from "@/generated/prisma/client";
import { CATALOGO_PRODUTOS, ehTipoProdutoValido } from "./catalogo-produtos";
import { statusVigentes } from "./status-contrato";

/** O contrato mínimo que a coleta usa — só leitura. */
export type ClienteLeitura = Pick<PrismaClient, "$queryRaw">;

export type Faixa = "atrasado" | "vencendo" | "adiante" | "sem_data";

/**
 * A régua de antecedência: quantos dias antes do fim de vigência um contrato
 * daquele produto entra na fila.
 *
 * `padrao` vale para produto sem regra própria. `porProduto` sobrepõe, e as
 * chaves são ids do catálogo (`catalogo-produtos.ts`).
 */
export type ReguaAntecedencia = {
  readonly padrao: number;
  readonly porProduto: Readonly<Record<string, number>>;
};

/**
 * O padrão que vale enquanto ninguém configurou nada.
 *
 * Os números não são chute de engenharia: são o ponto de partida que o
 * backoffice vai ajustar, e estão aqui só para o radar funcionar no primeiro
 * dia. A régua REAL é dado — mora em `Config`, muda sem deploy, e é isso que
 * permite o backoffice descobrir a antecedência certa usando a fila em vez de
 * decidir no vazio.
 *
 * Auto e residencial renovam rápido e o cliente decide perto do vencimento;
 * vida e saúde envolvem conversa e documento; consórcio e fiança têm trâmite
 * longo com terceiro (administradora, imobiliária). Daí a escada.
 */
export const REGUA_PADRAO: ReguaAntecedencia = {
  padrao: 30,
  porProduto: {
    auto: 30,
    residencial: 30,
    empresarial: 45,
    vida: 60,
    saude: 60,
    odonto: 45,
    "consorcio-auto": 90,
    "consorcio-imobiliario": 90,
    "fianca-locaticia": 90,
    "rc-profissional": 60,
    dit: 60,
  },
};

/** Quantos dias de antecedência valem para este produto. */
export function antecedenciaDe(tipoProduto: string, regua: ReguaAntecedencia): number {
  const propria = regua.porProduto[tipoProduto];
  return typeof propria === "number" && Number.isFinite(propria) && propria >= 0
    ? propria
    : regua.padrao;
}

/**
 * Dias inteiros entre hoje e o fim de vigência. Negativo = já passou.
 *
 * Contado em UTC e por DIA, não por instante: vigência é dia, e comparar
 * relógios faria o mesmo contrato mudar de faixa conforme a hora em que
 * alguém abre a tela. `montarData` (`importacao/valores.ts`) grava meio-dia
 * UTC pela mesma razão.
 */
export function diasAte(fimVigencia: Date, hoje: Date): number {
  const dia = 24 * 60 * 60 * 1000;
  const fim = Date.UTC(
    fimVigencia.getUTCFullYear(),
    fimVigencia.getUTCMonth(),
    fimVigencia.getUTCDate(),
  );
  const agora = Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate());
  return Math.round((fim - agora) / dia);
}

/**
 * Em que faixa este contrato cai.
 *
 * `dias === 0` é VENCENDO e não ATRASADO: vence hoje, ainda dá para ligar. É a
 * diferença entre a última chance e a perda consumada, e ela vale a linha.
 */
export function faixaDoContrato(
  fimVigencia: Date | null,
  tipoProduto: string,
  hoje: Date,
  regua: ReguaAntecedencia,
): Faixa {
  if (fimVigencia === null) return "sem_data";
  const dias = diasAte(fimVigencia, hoje);
  if (dias < 0) return "atrasado";
  return dias <= antecedenciaDe(tipoProduto, regua) ? "vencendo" : "adiante";
}

/**
 * Uma linha da fila — o mínimo para ligar para o cliente.
 *
 * `nome` e `telefone` vêm de `ClienteBackoffice`, alcançado pelo vínculo ou
 * pelo documento normalizado. São dado pessoal e saem daqui de propósito:
 * fila de renovação sem com quem falar é relatório, não ferramenta. Tudo
 * atrás do gate de admin.
 *
 * `null` nos dois é o cliente EXCLUSIVO da Corretora, que não tem contraparte
 * em Investimentos — e é a fatia que a medição de `medicoes.ts` conta.
 */
export type LinhaDoRadar = {
  readonly contratoId: string;
  readonly faixa: Faixa;
  /** Negativo = dias de atraso. `null` quando não há data. */
  readonly dias: number | null;
  readonly nome: string | null;
  readonly telefone: string | null;
  /** Documento do titular, só dígitos. Necessário para achar o cliente. */
  readonly cpfCnpj: string;
  readonly tipoProduto: string;
  readonly parceiro: string;
  readonly numeroContrato: string;
  readonly fimVigencia: Date | null;
  readonly status: string;
  readonly atendenteCorretora: string | null;
};

export type ResumoPorParceiro = {
  readonly parceiro: string;
  readonly atrasados: number;
  readonly vencendo: number;
  readonly semData: number;
  readonly total: number;
};

export type Radar = {
  readonly hoje: string;
  readonly regua: ReguaAntecedencia;
  readonly contagem: {
    readonly atrasados: number;
    readonly vencendo: number;
    readonly semData: number;
    readonly adiante: number;
  };
  /** Atrasados e vencendo, os mais urgentes primeiro. Sem data vem à parte. */
  readonly fila: readonly LinhaDoRadar[];
  /** Pendência de cadastro: contrato ativo que não diz quando termina. */
  readonly semData: readonly LinhaDoRadar[];
  readonly porParceiro: readonly ResumoPorParceiro[];
};

type LinhaCrua = {
  id: string;
  cpf_cnpj: string;
  tipo_produto: string;
  parceiro: string;
  numero_contrato: string;
  fim_vigencia: Date | null;
  status: string;
  atendente: string | null;
  nome: string | null;
  telefone: string | null;
};

/**
 * Carrega os contratos EM VIGOR da Corretora, com o contato do titular quando
 * ele existe.
 *
 * O `LEFT JOIN LATERAL` busca a contraparte em Investimentos por dois
 * caminhos, nesta ordem: o vínculo (`pessoaGrupoId`) e, quando ele não existe,
 * o documento normalizado. O `ORDER BY` dentro do lateral é o que garante que
 * o vínculo ganhe do casamento por documento quando os dois existirem — o
 * vínculo é decisão registrada, o documento é inferência.
 *
 * `[^0-9]` e não `\D`: em template literal do JavaScript, `\D` não é escape
 * reconhecido e chegaria ao Postgres como a letra `D`, apagando os "D" do
 * documento em vez dos não-dígitos. Mesma trava de `recon-identidade.ts`.
 *
 * Sem `take`: a Corretora inteira em vigor é a base do radar, e ela é da ordem
 * de centenas. Quando passar de alguns milhares, o corte entra aqui — e com
 * `count` do mesmo `where` ao lado, para a tela não mentir sobre o total.
 */
async function carregarContratos(
  db: ClienteLeitura,
  empresaId: string,
): Promise<LinhaCrua[]> {
  const vigentes = statusVigentes();
  return db.$queryRaw<LinhaCrua[]>`
    SELECT c.id,
           pg."cpfCnpj"          AS cpf_cnpj,
           c."tipoProduto"       AS tipo_produto,
           c.parceiro,
           c."numeroContrato"    AS numero_contrato,
           c."fimVigencia"       AS fim_vigencia,
           c.status,
           nullif(trim(c."atendenteCorretora"), '') AS atendente,
           cb.nome,
           cb.telefone
      FROM "ContratoCorretora" c
      JOIN "PessoaGrupo" pg ON pg.id = c."pessoaGrupoId"
      LEFT JOIN LATERAL (
        SELECT b.nome, b.telefone
          FROM "ClienteBackoffice" b
         WHERE b."pessoaGrupoId" = pg.id
            OR (
              pg."cpfCnpj" <> ''
              AND regexp_replace(coalesce(b."cpfCnpj", ''), '[^0-9]', '', 'g') = pg."cpfCnpj"
            )
         ORDER BY (b."pessoaGrupoId" = pg.id) DESC
         LIMIT 1
      ) cb ON true
     WHERE c."empresaId" = ${empresaId}
       AND c.status = ANY(${vigentes})
  `;
}

/** Ordena a fila por urgência: quem venceu há mais tempo vem primeiro. */
function porUrgencia(a: LinhaDoRadar, b: LinhaDoRadar): number {
  // `dias` nunca é null aqui — a fila só tem atrasado e vencendo —, mas o
  // `?? 0` evita que uma mudança futura de escopo vire NaN silencioso na
  // ordenação, que é o tipo de defeito que ninguém vê até a lista sair errada.
  const da = a.dias ?? 0;
  const db_ = b.dias ?? 0;
  if (da !== db_) return da - db_;
  // Desempate estável: duas apólices com a mesma data não podem trocar de
  // lugar entre dois carregamentos da tela.
  return a.contratoId < b.contratoId ? -1 : 1;
}

/**
 * Monta o radar a partir da régua e da data de referência.
 *
 * `hoje` entra por parâmetro em vez de `new Date()` aqui dentro: é o que torna
 * a função testável sem congelar relógio, e o que deixa a rota decidir o fuso.
 */
export async function coletarRadar(
  db: ClienteLeitura,
  opcoes: { readonly empresaId: string; readonly hoje: Date; readonly regua: ReguaAntecedencia },
): Promise<Radar> {
  const cruas = await carregarContratos(db, opcoes.empresaId);

  const linhas: LinhaDoRadar[] = cruas.map((c) => {
    const faixa = faixaDoContrato(c.fim_vigencia, c.tipo_produto, opcoes.hoje, opcoes.regua);
    return {
      contratoId: c.id,
      faixa,
      dias: c.fim_vigencia === null ? null : diasAte(c.fim_vigencia, opcoes.hoje),
      nome: c.nome,
      telefone: c.telefone,
      cpfCnpj: c.cpf_cnpj,
      tipoProduto: c.tipo_produto,
      parceiro: c.parceiro,
      numeroContrato: c.numero_contrato,
      fimVigencia: c.fim_vigencia,
      status: c.status,
      atendenteCorretora: c.atendente,
    };
  });

  const fila = linhas
    .filter((l) => l.faixa === "atrasado" || l.faixa === "vencendo")
    .sort(porUrgencia);
  const semData = linhas.filter((l) => l.faixa === "sem_data");

  const porParceiro = new Map<string, { a: number; v: number; s: number; t: number }>();
  for (const l of linhas) {
    const atual = porParceiro.get(l.parceiro) ?? { a: 0, v: 0, s: 0, t: 0 };
    if (l.faixa === "atrasado") atual.a += 1;
    if (l.faixa === "vencendo") atual.v += 1;
    if (l.faixa === "sem_data") atual.s += 1;
    atual.t += 1;
    porParceiro.set(l.parceiro, atual);
  }

  return {
    hoje: opcoes.hoje.toISOString().slice(0, 10),
    regua: opcoes.regua,
    contagem: {
      atrasados: linhas.filter((l) => l.faixa === "atrasado").length,
      vencendo: linhas.filter((l) => l.faixa === "vencendo").length,
      semData: semData.length,
      adiante: linhas.filter((l) => l.faixa === "adiante").length,
    },
    fila,
    semData,
    porParceiro: [...porParceiro.entries()]
      // Por atrasados primeiro: a leitura útil é "qual companhia está me
      // custando mais ligação agora", não a ordem alfabética.
      .map(([parceiro, n]) => ({
        parceiro,
        atrasados: n.a,
        vencendo: n.v,
        semData: n.s,
        total: n.t,
      }))
      .sort((x, y) => y.atrasados - x.atrasados || (x.parceiro < y.parceiro ? -1 : 1)),
  };
}

/** A chave em `Config` onde a régua mora. Muda sem deploy — é dado. */
export const CHAVE_DA_REGUA = "CORRETORA_ANTECEDENCIA_RENOVACAO";

/**
 * Lê a régua de um JSON guardado em `Config`, caindo no padrão a cada dúvida.
 *
 * Função PURA sobre o texto — quem busca no banco é o chamador. Toda entrada
 * inválida vira o padrão em silêncio, e isso é decisão: régua malformada não
 * pode derrubar a fila de renovação, que é a tela que existe para impedir
 * perda de cliente. O que ela NÃO faz é aceitar valor sem sentido — dia
 * negativo, produto fora do catálogo, número que não é número —, porque
 * antecedência errada é pior do que antecedência padrão.
 */
export function lerRegua(bruto: string | undefined | null): ReguaAntecedencia {
  if (!bruto) return REGUA_PADRAO;

  let dado: unknown;
  try {
    dado = JSON.parse(bruto);
  } catch {
    return REGUA_PADRAO;
  }
  if (typeof dado !== "object" || dado === null || Array.isArray(dado)) return REGUA_PADRAO;

  const obj = dado as Record<string, unknown>;
  const padrao = diaValido(obj.padrao) ? obj.padrao : REGUA_PADRAO.padrao;

  // `Object.create(null)` e lista de chaves recusadas: o valor vem de uma
  // coluna de texto, e `JSON.parse('{"__proto__":{...}}')` num objeto literal
  // é poluição de protótipo. Mesma trava de `importacao-ui/merge-dicionarios`.
  const porProduto: Record<string, number> = Object.create(null) as Record<string, number>;
  const cru = obj.porProduto;
  if (typeof cru === "object" && cru !== null && !Array.isArray(cru)) {
    for (const [produto, dias] of Object.entries(cru as Record<string, unknown>)) {
      if (CHAVES_RECUSADAS.has(produto)) continue;
      // Produto fora do catálogo é ignorado, não aceito: régua para um id que
      // nenhum contrato tem nunca entraria em vigor, e ficaria na configuração
      // parecendo que está valendo.
      if (!ehTipoProdutoValido(produto)) continue;
      if (!diaValido(dias)) continue;
      porProduto[produto] = dias;
    }
  }

  return { padrao, porProduto };
}

const CHAVES_RECUSADAS = new Set(["__proto__", "constructor", "prototype"]);

/**
 * Um número de dias utilizável: inteiro, não negativo, e com teto.
 *
 * O teto de 730 não é estético: sem ele, `porProduto: {auto: 99999}` põe todo
 * contrato de auto na fila para sempre, e a fila que mostra tudo não mostra
 * nada. Dois anos cobre consórcio, que é o trâmite mais longo do catálogo.
 */
function diaValido(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 730;
}

/** Os ids do catálogo, para a tela de configuração da régua saber o que oferecer. */
export function produtosConfiguraveis(): readonly string[] {
  return CATALOGO_PRODUTOS.map((p) => p.id);
}
