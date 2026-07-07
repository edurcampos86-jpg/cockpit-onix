/**
 * Leitura dos fatos do cliente (Fase Perfil·Leitura L1) — camada PURA e testável
 * que prepara os `ClienteFato` para a UI. Sem Prisma, sem React.
 *
 * L1 mostra só o VALOR ATUAL de cada campo (último por `criadoEm`); o histórico
 * dos append-only (patrimônio/idade/métrica numérica) fica para o L2.
 */

/** Fato serializado como chega do server (datas viram ISO string no JSON). */
export type FatoView = {
  id: string;
  categoria: string;
  campo: string;
  valor: string | null;
  valorAnterior: string | null;
  dados: unknown;
  fonte: string;
  sensivel: boolean;
  confirmado: boolean;
  vence: string | null;
  criadoEm: string;
  reuniaoId: string | null;
};

/** Um grupo de fatos de uma categoria, pronto para render. */
export type GrupoFatos = { categoria: string; label: string; fatos: FatoView[] };

/** Ordem canônica de exibição das categorias; desconhecidas vão para o fim. */
const ORDEM_CATEGORIAS = [
  "IDENTIDADE",
  "FAMILIA",
  "PROJETO",
  "SUCESSAO",
  "METRICA",
  "MEMORAVEL",
  "SAUDE",
] as const;

/** Rótulo legível de cada categoria (desconhecida → a própria string). */
export const LABEL_CATEGORIA: Record<string, string> = {
  IDENTIDADE: "Identidade",
  FAMILIA: "Família",
  PROJETO: "Projetos",
  SUCESSAO: "Sucessão",
  METRICA: "Métricas",
  MEMORAVEL: "Memoráveis",
  SAUDE: "Saúde",
};

function ordemCategoria(categoria: string): number {
  const i = ORDEM_CATEGORIAS.indexOf(categoria as (typeof ORDEM_CATEGORIAS)[number]);
  return i === -1 ? ORDEM_CATEGORIAS.length : i;
}

/**
 * Agrupa os fatos por categoria (na ordem canônica) mantendo só o mais recente
 * por campo. A chave de dedup é `categoria::campo` para não colidir campos
 * homônimos entre categorias. Fatos sem `valor` são descartados (nada a mostrar).
 * `criadoEm` é ISO 8601 → comparação lexical = cronológica.
 */
export function agruparFatosLeitura(fatos: FatoView[]): GrupoFatos[] {
  const maisRecentePorChave = new Map<string, FatoView>();
  for (const f of fatos) {
    if (f.valor == null || f.valor.trim() === "") continue;
    const chave = `${f.categoria}::${f.campo}`;
    const atual = maisRecentePorChave.get(chave);
    if (!atual || f.criadoEm > atual.criadoEm) maisRecentePorChave.set(chave, f);
  }

  const porCategoria = new Map<string, FatoView[]>();
  for (const f of maisRecentePorChave.values()) {
    const arr = porCategoria.get(f.categoria) ?? [];
    arr.push(f);
    porCategoria.set(f.categoria, arr);
  }

  return [...porCategoria.keys()]
    .sort((a, b) => ordemCategoria(a) - ordemCategoria(b) || a.localeCompare(b))
    .map((categoria) => ({
      categoria,
      label: LABEL_CATEGORIA[categoria] ?? categoria,
      fatos: (porCategoria.get(categoria) ?? [])
        .slice()
        .sort((x, y) => x.campo.localeCompare(y.campo)),
    }));
}

/**
 * Rótulo leve do campo para leitura (L1): remove o prefixo-tipo (até o 1º ':') e
 * troca hífen por espaço, capitalizando. Rótulos ricos por campo ficam para o L2.
 */
export function rotuloCampo(campo: string): string {
  const i = campo.indexOf(":");
  const base = i >= 0 ? campo.slice(i + 1) : campo;
  const s = base.replace(/-/g, " ").trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : campo;
}
