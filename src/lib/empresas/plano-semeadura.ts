import type { EmpresaSemente, NoArvore } from "./seed-hierarquia";

/**
 * O que o seed FARIA — módulo PURO (sem Prisma, sem rede).
 *
 * ── POR QUE ISTO EXISTE ──────────────────────────────────────────────────
 * `seed-empresas.ts` é idempotente e só cria linha nova, mas isso não é o
 * mesmo que ser previsível: até aqui a única forma de saber o que ele faria
 * era rodá-lo. Numa tabela que o RBAC consulta, "roda e vê" é o método que a
 * #301 já mostrou ser caro.
 *
 * A função abaixo separa três coisas que o seed trata como uma só:
 *
 *   CRIAR      — id que não existe no banco. É a única escrita que o seed faz.
 *   PRESERVAR  — id que existe e bate com o catálogo. Não é tocado.
 *   DIVERGIR   — id que existe e NÃO bate (nome, pai, tipo ou transversal).
 *                Também não é tocado — e é justamente por isso que precisa
 *                aparecer: `skipDuplicates` ignora a linha inteira, então uma
 *                divergência sobrevive ao seed em silêncio, para sempre.
 *
 * O terceiro grupo é o que o dry-run existe para mostrar. `imobiliaria` viveu
 * meses com o nome divergente do catálogo exatamente assim.
 */

export type Divergencia = {
  id: string;
  campo: "nome" | "parentId" | "tipo" | "transversal";
  noBanco: string;
  noCatalogo: string;
};

export type PlanoSemeadura = {
  /** Sementes que virariam INSERT, na ordem em que o seed as agruparia. */
  criar: EmpresaSemente[];
  /** Ids que já existem e conferem com o catálogo — intocados. */
  preservar: string[];
  /** Existem, não conferem, e o seed NÃO conserta. */
  divergencias: Divergencia[];
  /** Linhas no banco que o catálogo não conhece. O seed também não as toca. */
  foraDoCatalogo: string[];
  totalAntes: number;
  totalDepois: number;
};

function comparar(no: NoArvore, semente: EmpresaSemente): Divergencia[] {
  const out: Divergencia[] = [];
  const par = (
    campo: Divergencia["campo"],
    noBanco: string | null | boolean,
    noCatalogo: string | null | boolean,
  ) => {
    if (String(noBanco) !== String(noCatalogo)) {
      out.push({
        id: no.id,
        campo,
        noBanco: noBanco === null ? "(null)" : String(noBanco),
        noCatalogo: noCatalogo === null ? "(null)" : String(noCatalogo),
      });
    }
  };
  par("nome", no.nome, semente.nome);
  par("parentId", no.parentId, semente.parentId);
  par("tipo", no.tipo, semente.tipo);
  par("transversal", no.transversal, semente.transversal);
  return out;
}

/**
 * `arvoreAtual` é o estado do banco; `catalogo` é o alvo declarado.
 *
 * Nada aqui escreve, e a ordem de `criar` respeita a de entrada — quem ordena
 * por profundidade para a FK é `lotesPorProfundidade`, no momento do INSERT.
 */
export function planejarSemeadura(
  catalogo: readonly EmpresaSemente[],
  arvoreAtual: readonly NoArvore[],
): PlanoSemeadura {
  const porId = new Map(arvoreAtual.map((n) => [n.id, n]));
  const idsCatalogo = new Set(catalogo.map((s) => s.id));

  const criar: EmpresaSemente[] = [];
  const preservar: string[] = [];
  const divergencias: Divergencia[] = [];

  for (const semente of catalogo) {
    const existente = porId.get(semente.id);
    if (!existente) {
      criar.push(semente);
      continue;
    }
    const difs = comparar(existente, semente);
    if (difs.length === 0) preservar.push(semente.id);
    else divergencias.push(...difs);
  }

  const foraDoCatalogo = arvoreAtual
    .map((n) => n.id)
    .filter((id) => !idsCatalogo.has(id));

  return {
    criar,
    preservar,
    divergencias,
    foraDoCatalogo,
    totalAntes: arvoreAtual.length,
    totalDepois: arvoreAtual.length + criar.length,
  };
}

/** Relatório em texto do plano — mesma saída no dry-run e no log do seed. */
export function descreverPlano(plano: PlanoSemeadura): string {
  const l: string[] = [];
  l.push(`Linhas hoje: ${plano.totalAntes}  →  depois do seed: ${plano.totalDepois}`);
  l.push("");

  l.push(`CRIAR (${plano.criar.length}):`);
  if (plano.criar.length === 0) l.push("  (nenhuma — o catálogo já está todo no banco)");
  for (const s of plano.criar) {
    const pai = s.parentId ?? "(raiz)";
    const t = s.transversal ? " · transversal" : "";
    l.push(`  + ${s.id.padEnd(30)} pai=${pai.padEnd(16)} ${s.tipo.padEnd(13)} ${s.nome}${t}`);
  }
  l.push("");

  l.push(`PRESERVAR, intocadas (${plano.preservar.length}):`);
  if (plano.preservar.length === 0) l.push("  (nenhuma)");
  for (const id of plano.preservar) l.push(`  = ${id}`);
  l.push("");

  l.push(`DIVERGENTES — existem e o seed NÃO conserta (${plano.divergencias.length}):`);
  if (plano.divergencias.length === 0) l.push("  (nenhuma)");
  for (const d of plano.divergencias) {
    l.push(`  ! ${d.id.padEnd(30)} ${d.campo.padEnd(12)} banco="${d.noBanco}" catálogo="${d.noCatalogo}"`);
  }
  l.push("");

  l.push(`FORA DO CATÁLOGO — o seed ignora (${plano.foraDoCatalogo.length}):`);
  if (plano.foraDoCatalogo.length === 0) l.push("  (nenhuma)");
  for (const id of plano.foraDoCatalogo) l.push(`  ? ${id}`);

  return l.join("\n");
}
