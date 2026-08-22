/* ──────────────────────────────────────────────────────────────
 * Juntar o que a pessoa acabou de ensinar com o que o perfil já sabia.
 *
 * Módulo de UI, PURO. Não fala com banco, não importa nada do motor além do
 * tipo do perfil.
 *
 * ── POR QUE ISTO EXISTE, E POR QUE UM SPREAD RASO NÃO SERVE ─────────────
 * `dicionarios` tem DOIS níveis: campo → { rótulo do arquivo → valor
 * canônico }. Um `{ ...antigo, ...novo }` substitui o objeto inteiro do campo:
 * ensinar "SEG VIDA" → `vida` apagaria as outras trinta traduções de
 * `tipoProduto` que o perfil já tinha. O perfil "aprenderia" esquecendo.
 *
 * O merge aqui é por campo E por rótulo. O novo vence no rótulo que ele toca,
 * e só nele.
 *
 * ── O QUE ELE SE RECUSA A FAZER ─────────────────────────────────────────
 * Rótulo mapeado para string vazia é DESCARTADO, não gravado. Vazio no
 * dicionário viraria uma tradução para nada — a linha passaria na validação e
 * gravaria lixo. Pendente é um estado honesto; traduzido-para-vazio não é.
 * ────────────────────────────────────────────────────────────── */

import type { PerfilImportacaoConfig } from "@/lib/importacao/perfil";

export type Dicionarios = PerfilImportacaoConfig["dicionarios"];

/** O que a pessoa resolveu na tela: campo → { rótulo → valor canônico }. */
export type Aprendizado = Readonly<Record<string, Readonly<Record<string, string>>>>;

export type ResultadoMerge = {
  readonly dicionarios: Dicionarios;
  /** Rótulos que passaram a existir. */
  readonly adicionados: { campo: string; rotulo: string; valor: string }[];
  /** Rótulos que já existiam e mudaram de valor — é aqui que se perde dado. */
  readonly redefinidos: { campo: string; rotulo: string; de: string; para: string }[];
  /** Rótulos ignorados por virem sem valor. */
  readonly descartados: { campo: string; rotulo: string }[];
};

/**
 * Devolve o dicionário resultante e o que mudou, item a item.
 *
 * A lista de `redefinidos` não é enfeite: é o único aviso de que ensinar uma
 * palavra desaprendeu outra. A tela mostra isso antes de gravar.
 */
export function mesclarDicionarios(
  atual: Dicionarios,
  aprendizado: Aprendizado,
): ResultadoMerge {
  const resultado: Record<string, Record<string, string>> = {};
  for (const [campo, tabela] of Object.entries(atual)) {
    resultado[campo] = { ...tabela };
  }

  const adicionados: ResultadoMerge["adicionados"] = [];
  const redefinidos: ResultadoMerge["redefinidos"] = [];
  const descartados: ResultadoMerge["descartados"] = [];

  for (const [campo, tabela] of Object.entries(aprendizado)) {
    for (const [rotuloCru, valorCru] of Object.entries(tabela)) {
      const rotulo = rotuloCru.trim();
      const valor = valorCru.trim();
      if (rotulo === "" || valor === "") {
        descartados.push({ campo, rotulo: rotuloCru });
        continue;
      }
      const destino = (resultado[campo] ??= {});
      const anterior = destino[rotulo];
      if (anterior === undefined) {
        adicionados.push({ campo, rotulo, valor });
      } else if (anterior !== valor) {
        redefinidos.push({ campo, rotulo, de: anterior, para: valor });
      }
      destino[rotulo] = valor;
    }
  }

  return { dicionarios: resultado, adicionados, redefinidos, descartados };
}

/** Quantos rótulos o perfil conhece, somando todos os campos. */
export function tamanhoDoVocabulario(dicionarios: Dicionarios): number {
  return Object.values(dicionarios).reduce((n, t) => n + Object.keys(t).length, 0);
}
