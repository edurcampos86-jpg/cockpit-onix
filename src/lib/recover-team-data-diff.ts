/**
 * Compara o time VERSIONADO (recover-team-data.ts) com o time do BANCO — PURO,
 * sem prisma, para ser testável sem DATABASE_URL.
 *
 * Por que existe: `recover-team-data.ts` é a rede de restauração do /time — é
 * dele que as pessoas voltam se o banco se perder. E ele já está defasado:
 * 4 assessores com carteira ativa na Base BTG (Humberto, 141 clientes; Alan,
 * 31; Felipe Tachard, 14; Laiane, 5) não constam do arquivo.
 *
 * Uma rede de restauração que ninguém confere só diverge mais. Um arquivo de
 * seed não "quebra" nada no dia a dia — ele falha silenciosamente no único dia
 * em que importa.
 *
 * A comparação é por CPF, não por nome nem e-mail: é a única chave estável
 * entre as duas pontas (o e-mail muda, o nome tem grafia variável).
 */

import { chaveCpf } from "./backoffice/cpf";

export type PessoaComparavel = {
  cpf: string;
  nomeCompleto: string;
  email: string;
};

export type DivergenciaTime = {
  /** Está no banco e não no arquivo — não voltaria numa restauração. */
  faltandoNoArquivo: PessoaComparavel[];
  /** Está no arquivo e não no banco — seed obsoleto (pessoa removida à mão?). */
  faltandoNoBanco: PessoaComparavel[];
  /** Mesmo CPF, dado diferente — o arquivo restauraria com informação velha. */
  divergentes: Array<{
    cpf: string;
    campo: "nomeCompleto" | "email";
    noArquivo: string;
    noBanco: string;
  }>;
};

/** Há algo a corrigir? */
export function temDivergencia(d: DivergenciaTime): boolean {
  return (
    d.faltandoNoArquivo.length > 0 ||
    d.faltandoNoBanco.length > 0 ||
    d.divergentes.length > 0
  );
}

export function compararTime(
  versionadas: PessoaComparavel[],
  doBanco: PessoaComparavel[],
): DivergenciaTime {
  const porCpf = (lista: PessoaComparavel[]) => {
    const m = new Map<string, PessoaComparavel>();
    for (const p of lista) {
      const k = chaveCpf(p.cpf);
      if (k) m.set(k, p);
    }
    return m;
  };

  const arquivo = porCpf(versionadas);
  const banco = porCpf(doBanco);

  const faltandoNoArquivo: PessoaComparavel[] = [];
  const faltandoNoBanco: PessoaComparavel[] = [];
  const divergentes: DivergenciaTime["divergentes"] = [];

  for (const [cpf, pBanco] of banco) {
    const pArquivo = arquivo.get(cpf);
    if (!pArquivo) {
      faltandoNoArquivo.push(pBanco);
      continue;
    }
    // Nome: comparação tolerante a caixa e espaço duplo — "José  Silva" e
    // "JOSE SILVA" não são divergência de dado, são digitação.
    const norm = (v: string) => v.trim().replace(/\s+/g, " ").toLowerCase();
    if (norm(pArquivo.nomeCompleto) !== norm(pBanco.nomeCompleto)) {
      divergentes.push({
        cpf,
        campo: "nomeCompleto",
        noArquivo: pArquivo.nomeCompleto,
        noBanco: pBanco.nomeCompleto,
      });
    }
    if (pArquivo.email.trim().toLowerCase() !== pBanco.email.trim().toLowerCase()) {
      divergentes.push({
        cpf,
        campo: "email",
        noArquivo: pArquivo.email,
        noBanco: pBanco.email,
      });
    }
  }

  for (const [cpf, pArquivo] of arquivo) {
    if (!banco.has(cpf)) faltandoNoBanco.push(pArquivo);
  }

  return { faltandoNoArquivo, faltandoNoBanco, divergentes };
}

/** Relatório de uma linha por problema, pronto para console ou log de CI. */
export function formatarDivergencia(d: DivergenciaTime): string[] {
  const linhas: string[] = [];
  for (const p of d.faltandoNoArquivo) {
    linhas.push(`FALTA NO ARQUIVO  ${p.nomeCompleto} <${p.email}> — não voltaria numa restauração`);
  }
  for (const p of d.faltandoNoBanco) {
    linhas.push(`FALTA NO BANCO    ${p.nomeCompleto} <${p.email}> — seed obsoleto`);
  }
  for (const v of d.divergentes) {
    linhas.push(`DIVERGENTE        ${v.campo}: arquivo="${v.noArquivo}" banco="${v.noBanco}"`);
  }
  return linhas;
}
