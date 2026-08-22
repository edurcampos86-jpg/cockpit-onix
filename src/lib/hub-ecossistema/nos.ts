/* ──────────────────────────────────────────────────────────────
 * Hub "Ecossistema Onix" — config dos 8 nós que orbitam o núcleo,
 * mais a geometria da órbita.
 *
 * Módulo PURO e client-safe de propósito: sem prisma, sem `server-only`,
 * sem React. É importado tanto pela page (server) quanto pelo componente
 * do hub ('use client'), e é o que os testes exercitam.
 *
 * `icon` é o NOME de um ícone lucide-react resolvido pelo componente —
 * mesmo idioma de `empresas-config.ts`, para não colocar componente React
 * dentro de config de dados.
 * ────────────────────────────────────────────────────────────── */

/**
 * Quanto a empresa realmente entrega hoje, em três degraus:
 *
 *   • `pronta`   — tem página com conteúdo de verdade;
 *   • `shell`    — a rota existe e responde, mas cai em `EmpresaPlaceholder`
 *                  ("já tem endereço, falta o recheio");
 *   • `sem-rota` — não existe página nenhuma; o clique cai no 404 do Next.
 *
 * Na TELA os dois últimos aparecem igual ("Em construção"), porque para quem
 * usa o hub a diferença entre "abriu vazio" e "não abriu" não muda a decisão —
 * nos dois casos não há nada para fazer ali. A distinção fica guardada no dado
 * porque ela É diferente para quem constrói: `sem-rota` é a lista do que
 * precisa nascer, `shell` é a lista do que precisa de recheio. Separar os dois
 * visualmente depois é trocar `emConstrucao` por uma comparação.
 */
export type MaturidadeNo = "pronta" | "shell" | "sem-rota";

export type NoEcossistema = {
  /**
   * Id interno e ESTÁVEL. Onde existe empresa correspondente em
   * `empresas-config.ts`, o id é o MESMO (`investimentos`, `corretora`,
   * `imobiliaria`, `corporate`, `tech`, `educacao`) — é essa igualdade que
   * vai permitir casar nó → permissão quando o RBAC entrar (ver `acesso.ts`).
   *
   * QUEM pode aparecer aqui é declarado em `lib/empresas/catalogo.ts`
   * (`noHub: true`) e travado por `catalogo.test.ts`. Nó novo sem entrada lá
   * fica invisível para o seed e para o RBAC — foi assim que `agro` e
   * `contabil` chegaram à tela sem existir no resto do sistema.
   */
  id: string;
  /** Rótulo exibido no nó. */
  nome: string;
  /**
   * Rota real da empresa. Pode ainda não existir — nesse caso o clique cai no
   * 404 padrão do Next, o que é aceito nesta fase (e sinalizado no nó pela tag
   * "Em construção").
   */
  href: string;
  /** Nome do ícone lucide-react (resolvido em `hub-ecossistema.tsx`). */
  icon: string;
  /**
   * O que a empresa entrega hoje. INDEPENDENTE de acesso: um nó pode estar em
   * construção e liberado, ou pronto e bloqueado. São dois eixos diferentes e
   * a UI mostra os dois.
   */
  maturidade: MaturidadeNo;
};

/**
 * Os 8 nós, em ordem HORÁRIA a partir das 12h. A ordem do array É a ordem
 * visual da órbita (o índice alimenta `posicaoOrbital`), então reordenar aqui
 * gira o desenho — é o único lugar que decide a posição de cada empresa.
 *
 * A `maturidade` de cada uma foi conferida contra `src/app/empresas/*`, não
 * assumida: `investimentos` é a única com páginas de verdade (btg, cadencia,
 * clientes, grupos, indicacoes, painel-do-dia, performance, receita,
 * storyselling); corretora, corporate, imobiliaria e tech têm rota que responde
 * mas o corpo é `EmpresaPlaceholder`; agro, educacao e contabil não têm página
 * nenhuma. Todas as rotas existentes funcionam com NEXT_PUBLIC_NAV_V2 ligado ou
 * desligado — a flag só controla a barra de abas.
 *
 * Quando uma empresa ganhar conteúdo, é UMA palavra aqui — o href já aponta
 * para o lugar certo.
 */
export const NOS_ECOSSISTEMA: readonly NoEcossistema[] = [
  { id: "investimentos", nome: "Onix Capital", href: "/empresas/investimentos", icon: "TrendingUp", maturidade: "pronta" },
  { id: "agro", nome: "Onix Agro", href: "/empresas/agro", icon: "Sprout", maturidade: "sem-rota" },
  { id: "corretora", nome: "Onix Corretora", href: "/empresas/corretora", icon: "ShieldCheck", maturidade: "shell" },
  { id: "corporate", nome: "Onix Corporate", href: "/empresas/corporate", icon: "Building2", maturidade: "shell" },
  { id: "imobiliaria", nome: "Onix Imob", href: "/empresas/imobiliaria", icon: "Home", maturidade: "shell" },
  { id: "tech", nome: "Onix Tech", href: "/empresas/tech", icon: "Cpu", maturidade: "shell" },
  /* Id `educacao` para casar com `empresas-config.ts`. O rótulo era "Onix
   * Educacional" (o protótipo aprovado do hub) enquanto a Central de
   * Implementações chamava de "Onix Educação" — divergência que ficou
   * declarada como consciente até alguém decidir. O Eduardo decidiu: é "Onix
   * Educação", e este era o ÚNICO lugar do sistema que ainda dizia o
   * contrário. */
  { id: "educacao", nome: "Onix Educação", href: "/empresas/educacao", icon: "GraduationCap", maturidade: "sem-rota" },
  { id: "contabil", nome: "Onix Contábil", href: "/empresas/contabil", icon: "Calculator", maturidade: "sem-rota" },
] as const;

/**
 * Mostra a tag "Em construção"? Vale para tudo que ainda não entrega conteúdo,
 * exista rota ou não — é o único lugar que colapsa `shell` e `sem-rota` numa
 * coisa só. Para separar os dois na tela, é aqui que se mexe.
 */
export function emConstrucao(no: NoEcossistema): boolean {
  return no.maturidade !== "pronta";
}

/**
 * Nó com o estado de acesso já resolvido — o formato que o componente recebe.
 * Vive aqui (e não em `acesso.ts`) porque `acesso.ts` é `server-only` e o
 * componente do hub é `'use client'`: o tipo precisa morar do lado que os dois
 * podem importar.
 */
export type NoEcossistemaResolvido = NoEcossistema & {
  /** Sem acesso → opacidade reduzida, cadeado, tooltip e clique desligado. */
  locked: boolean;
};

/** Ângulo entre dois nós vizinhos: 360° / 8 = 45°. */
export const ANGULO_ENTRE_NOS_GRAUS = 360 / NOS_ECOSSISTEMA.length;

/** Multiplicadores do raio para um nó da órbita. */
export type PosicaoOrbital = {
  /** Deslocamento horizontal, em múltiplos do raio (−1 … 1). */
  fatorX: number;
  /** Deslocamento vertical, em múltiplos do raio (−1 … 1). Y cresce para BAIXO em CSS. */
  fatorY: number;
};

/** Zera resíduo de ponto flutuante (cos 90° = 6.1e-17) e corta a precisão. */
function limpar(n: number): number {
  return Math.abs(n) < 1e-9 ? 0 : Number(n.toFixed(6));
}

/**
 * Posição de um nó na órbita, como MULTIPLICADORES do raio — não como pixels.
 *
 * O raio é uma custom property CSS (`--raio-orbita`, um `clamp()` responsivo),
 * então o componente monta `calc(50% + (var(--raio-orbita) * fatorX))`. Assim a
 * órbita acompanha a largura do container sem medir nada em JS: sem
 * ResizeObserver, sem estado, sem divergência de hidratação entre server e
 * client (os fatores são constantes do índice, iguais nos dois lados).
 *
 * Índice 0 fica às 12h (topo) e a contagem segue no sentido horário — daí o
 * −90° na conversão.
 */
export function posicaoOrbital(
  indice: number,
  total: number = NOS_ECOSSISTEMA.length,
): PosicaoOrbital {
  const anguloGraus = indice * (360 / total) - 90;
  const anguloRad = (anguloGraus * Math.PI) / 180;
  return {
    fatorX: limpar(Math.cos(anguloRad)),
    fatorY: limpar(Math.sin(anguloRad)),
  };
}
