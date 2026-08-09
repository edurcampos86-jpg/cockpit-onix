/**
 * Identidade da pessoa-titular do grupo — módulo PURO.
 *
 * Decide o que é documento válido, qual o seu tipo, e — o mais importante —
 * QUANDO dois registros podem ser a mesma pessoa. Sem Prisma, sem
 * `server-only`, sem I/O: testável sem banco e usável no servidor ou no
 * cliente.
 *
 * NESTA FASE nada chama estas funções. A tabela `PessoaGrupo` nasce vazia e
 * `ClienteBackoffice.pessoaGrupoId` nasce null em todas as linhas. O módulo
 * existe para que a PR de backfill não precise inventar a régua no meio de um
 * UPDATE em massa.
 */

/* ──────────────────────────────────────────────────────────────────────────
 * Normalização
 * ────────────────────────────────────────────────────────────────────── */

export type TipoDocumento = "CPF" | "CNPJ";

/** Tamanhos que este projeto reconhece como documento. */
const DIGITOS_CPF = 11;
const DIGITOS_CNPJ = 14;

/**
 * Documento canônico: só dígitos, sem máscara. `null` quando não é um
 * documento reconhecível.
 *
 * Devolve `null` — e não string vazia — de propósito: vazio é confundível com
 * "documento ausente mas válido", e este valor vai ser chave UNIQUE em
 * `PessoaGrupo.cpfCnpj`. Quem chama tem de decidir o que fazer com o não
 * reconhecido, não herdar um valor plausível.
 *
 * Zeros à esquerda são preservados: em documento eles são identidade, não
 * formatação (mesma regra de `chaveCpf` em src/lib/backoffice/cpf.ts, e o
 * oposto de `numeroConta`, onde zero à esquerda é ruído).
 *
 * NÃO valida dígito verificador. A checagem de DV existe em
 * `cpfValido()` (src/lib/backoffice/cpf.ts) e é ortogonal: um CPF com DV
 * errado ainda é um identificador de 11 dígitos que o BTG pode ter exportado,
 * e recusá-lo aqui perderia o vínculo em vez de sinalizá-lo. Quem quiser a
 * régua estrita compõe as duas.
 */
export function normalizarDocumento(valor: string | null | undefined): string | null {
  const digitos = (valor ?? "").replace(/[^0-9]/g, "");
  if (digitos.length !== DIGITOS_CPF && digitos.length !== DIGITOS_CNPJ) return null;
  return digitos;
}

/**
 * Tipo do documento a partir do tamanho. `null` para o que não é documento.
 *
 * Aceita valor com ou sem máscara — normaliza antes de medir, para não
 * depender de o chamador ter passado pelo `normalizarDocumento` primeiro.
 */
export function classificarTipo(valor: string | null | undefined): TipoDocumento | null {
  const doc = normalizarDocumento(valor);
  if (doc === null) return null;
  return doc.length === DIGITOS_CPF ? "CPF" : "CNPJ";
}

/* ──────────────────────────────────────────────────────────────────────────
 * Regra de união
 * ────────────────────────────────────────────────────────────────────── */

export type MotivoRecusa =
  /** Um dos lados não é documento reconhecível. */
  | "documento_invalido"
  /** CPF de um lado, CNPJ do outro. */
  | "tipos_diferentes"
  /** Mesmo tipo, documentos diferentes. */
  | "documentos_diferentes";

export type ResultadoUniao =
  | { une: true; documento: string; tipo: TipoDocumento }
  | { une: false; motivo: MotivoRecusa; mensagem: string };

/**
 * Dois documentos são a MESMA pessoa-titular?
 *
 * A régua, explícita:
 *
 *  - **CPF ↔ CPF** com os mesmos dígitos → une.
 *  - **CNPJ ↔ CNPJ** com os mesmos dígitos → une.
 *  - **CPF ↔ CNPJ** → NUNCA une automaticamente, nem quando é sabidamente o
 *    mesmo dono. Um sócio e a empresa dele são titulares distintos: têm
 *    patrimônio, tributação e suitability próprios. Unir os dois em uma
 *    PessoaGrupo misturaria dois patrimônios num só saldo. Esse vínculo
 *    existe no mundo real, mas é decisão HUMANA — precisa de campo próprio e
 *    de quem assine, não de inferência.
 *
 * E-mail e telefone **não entram nesta função** e não são sinal de união.
 * Casal divide e-mail, empresa divide telefone, conta compartilhada divide os
 * dois — o recon já mostra quantos clientes repetem cada um
 * (api/backoffice/recon-identidade, item 8, rotulado como estimativa). Servem
 * para dimensionar conciliação manual, nunca para unificar sozinhos.
 */
export function podemUnir(
  documentoA: string | null | undefined,
  documentoB: string | null | undefined,
): ResultadoUniao {
  const a = normalizarDocumento(documentoA);
  const b = normalizarDocumento(documentoB);

  if (a === null || b === null) {
    return {
      une: false,
      motivo: "documento_invalido",
      mensagem:
        "Documento não reconhecido (esperado 11 dígitos para CPF ou 14 para CNPJ, com ou sem máscara).",
    };
  }

  const tipoA = classificarTipo(a) as TipoDocumento;
  const tipoB = classificarTipo(b) as TipoDocumento;

  if (tipoA !== tipoB) {
    return {
      une: false,
      motivo: "tipos_diferentes",
      mensagem:
        `${tipoA} e ${tipoB} nunca unem automaticamente. Sócio e empresa são titulares ` +
        "distintos (patrimônio, tributação e suitability próprios); o vínculo entre eles " +
        "é decisão humana, não inferência.",
    };
  }

  if (a !== b) {
    return {
      une: false,
      motivo: "documentos_diferentes",
      mensagem: `Dois ${tipoA} diferentes são duas pessoas.`,
    };
  }

  return { une: true, documento: a, tipo: tipoA };
}

/**
 * E-mail ou telefone podem, sozinhos, unir duas pessoas?
 *
 * Sempre `false`. Existe como função — em vez de só um comentário — para que
 * a regra apareça em `grep`, tenha teste, e para que quem for tentado a usar
 * contato como chave encontre a recusa antes do UPDATE em massa.
 */
export function contatoUneSozinho(): false {
  return false;
}

/**
 * Chave canônica para agrupar uma coleção de documentos em pessoas-titulares.
 *
 * Devolve um Map documento→lista de índices de entrada. Documento não
 * reconhecido é descartado (e reportado à parte), nunca agrupado sob uma
 * chave vazia — senão todo lixo do import viraria "a mesma pessoa".
 */
export function agruparPorDocumento(
  documentos: readonly (string | null | undefined)[],
): { grupos: Map<string, number[]>; invalidos: number[] } {
  const grupos = new Map<string, number[]>();
  const invalidos: number[] = [];

  documentos.forEach((bruto, indice) => {
    const doc = normalizarDocumento(bruto);
    if (doc === null) {
      invalidos.push(indice);
      return;
    }
    const atual = grupos.get(doc);
    if (atual) atual.push(indice);
    else grupos.set(doc, [indice]);
  });

  return { grupos, invalidos };
}
