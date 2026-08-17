/* ──────────────────────────────────────────────────────────────
 * Leitura DETERMINÍSTICA de planilha: Excel e CSV. Nenhuma chamada de IA.
 *
 * Nada aqui adivinha. Se o cabeçalho declarado no perfil não existe, a leitura
 * FALHA — em vez de "achar" a coluna parecida. Um mapeamento que se conserta
 * sozinho é um mapeamento que um dia vai se consertar errado, e o sintoma
 * aparece meses depois, num relatório, sem rastro de onde nasceu.
 * ────────────────────────────────────────────────────────────── */

import * as XLSX from "xlsx";

import type { ArquivoEntrada, LinhaExtraida, ResultadoExtracao } from "./extracao";
import type { PerfilImportacaoConfig } from "./perfil";

/**
 * CSV à mão, e não uma dependência: o dialeto que interessa é pequeno e
 * fechado — aspas duplas, aspas escapadas por duplicação, quebra de linha
 * dentro do campo, CRLF. Escrever é mais barato que auditar um pacote.
 */
export function lerCsv(texto: string, delimitador: string): string[][] {
  const linhas: string[][] = [];
  let campo = "";
  let linha: string[] = [];
  let dentroDeAspas = false;

  const conteudo = texto.replace(/^﻿/, ""); // BOM do Excel brasileiro

  for (let i = 0; i < conteudo.length; i += 1) {
    const c = conteudo[i];

    if (dentroDeAspas) {
      if (c === '"') {
        if (conteudo[i + 1] === '"') {
          campo += '"';
          i += 1;
        } else {
          dentroDeAspas = false;
        }
      } else {
        campo += c;
      }
      continue;
    }

    if (c === '"') {
      dentroDeAspas = true;
    } else if (c === delimitador) {
      linha.push(campo);
      campo = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && conteudo[i + 1] === "\n") i += 1;
      linha.push(campo);
      linhas.push(linha);
      linha = [];
      campo = "";
    } else {
      campo += c;
    }
  }

  if (campo.length > 0 || linha.length > 0) {
    linha.push(campo);
    linhas.push(linha);
  }

  return linhas;
}

/**
 * Descobre o delimitador quando o perfil não declara.
 *
 * Só entre `;` e `,`, e pela contagem na primeira linha não vazia. Planilha
 * gerada em pt-BR sai com `;` porque a vírgula já é o decimal — ler com `,`
 * partiria "1.234,56" em duas colunas e deslocaria a linha inteira.
 */
export function detectarDelimitador(texto: string): string {
  const primeira = texto.split(/\r?\n/).find((l) => l.trim().length > 0) ?? "";
  const pontoEVirgula = (primeira.match(/;/g) ?? []).length;
  const virgula = (primeira.match(/,/g) ?? []).length;
  return pontoEVirgula >= virgula && pontoEVirgula > 0 ? ";" : ",";
}

function montarLinhas(
  grade: string[][],
  linhaCabecalho: number,
  avisos: string[],
): LinhaExtraida[] {
  const indiceCabecalho = linhaCabecalho - 1;
  const cabecalho = grade[indiceCabecalho];
  if (!cabecalho) {
    throw new Error(
      `linha de cabeçalho ${linhaCabecalho} não existe — o arquivo tem ${grade.length} linha(s)`,
    );
  }

  const rotulos = cabecalho.map((r) => String(r ?? "").trim());
  const repetidos = rotulos.filter((r, i) => r !== "" && rotulos.indexOf(r) !== i);
  if (repetidos.length > 0) {
    // Não é erro fatal: a coluna repetida pode nem estar mapeada. Mas se
    // estiver, a última vence, e isso precisa aparecer no relatório.
    avisos.push(`cabeçalho com rótulo repetido: ${[...new Set(repetidos)].join(", ")}`);
  }

  const linhas: LinhaExtraida[] = [];
  for (let i = indiceCabecalho + 1; i < grade.length; i += 1) {
    const bruta = grade[i];
    const celulas: Record<string, string> = {};
    let temConteudo = false;
    for (let c = 0; c < rotulos.length; c += 1) {
      const rotulo = rotulos[c];
      if (rotulo === "") continue;
      const valor = String(bruta[c] ?? "").trim();
      celulas[rotulo] = valor;
      if (valor !== "") temConteudo = true;
    }
    // Linha inteiramente vazia é rodapé de planilha, não dado. Contá-la
    // inflaria "linhas lidas" e encheria o relatório de rejeições sem motivo.
    if (!temConteudo) continue;
    linhas.push({ numero: i + 1, celulas, origem: "deterministica" });
  }
  return linhas;
}

export function extrairPlanilha(
  arquivo: ArquivoEntrada,
  perfil: PerfilImportacaoConfig,
): ResultadoExtracao {
  const avisos: string[] = [];

  if (perfil.extracao.tipo === "csv") {
    const encoding = (perfil.extracao.encoding ?? "utf-8").toLowerCase();
    const decoder = encoding.includes("latin") || encoding.includes("8859") ? "latin1" : "utf8";
    const texto = arquivo.conteudo.toString(decoder as BufferEncoding);
    const delimitador = perfil.extracao.delimitador ?? detectarDelimitador(texto);
    if (!perfil.extracao.delimitador) {
      avisos.push(`delimitador não declarado no perfil; detectado ${JSON.stringify(delimitador)}`);
    }
    const grade = lerCsv(texto, delimitador);
    return {
      formato: "csv",
      arquivo: arquivo.nome,
      linhas: montarLinhas(grade, perfil.extracao.linhaCabecalho ?? 1, avisos),
      custo: null,
      avisos,
    };
  }

  if (perfil.extracao.tipo !== "xlsx") {
    throw new Error(`extrairPlanilha não lê extracao.tipo=${perfil.extracao.tipo}`);
  }

  const livro = XLSX.read(arquivo.conteudo, { type: "buffer", cellDates: false });
  const nomeAba = perfil.extracao.aba ?? livro.SheetNames[0];
  const aba = livro.Sheets[nomeAba];
  if (!aba) {
    throw new Error(
      `aba ${JSON.stringify(nomeAba)} não existe — o arquivo tem: ${livro.SheetNames.join(", ")}`,
    );
  }
  if (perfil.extracao.aba && perfil.extracao.aba !== livro.SheetNames[0]) {
    avisos.push(`lendo a aba ${JSON.stringify(nomeAba)}, que não é a primeira do arquivo`);
  }

  // `raw: false` + `dateNF` fixo: a célula de data chega SEMPRE como dd/mm/aaaa,
  // independentemente da formatação que o autor da planilha escolheu. Sem isso,
  // o mesmo arquivo salvo com locale diferente entregaria 03/04 e 04/03 para a
  // mesma data, e o perfil declarando `data_ddmmaaaa` leria março por abril.
  const grade = XLSX.utils.sheet_to_json<string[]>(aba, {
    header: 1,
    raw: false,
    defval: "",
    blankrows: true,
    dateNF: "dd/mm/yyyy",
  });

  return {
    formato: "xlsx",
    arquivo: arquivo.nome,
    linhas: montarLinhas(grade, perfil.extracao.linhaCabecalho ?? 1, avisos),
    custo: null,
    avisos,
  };
}
