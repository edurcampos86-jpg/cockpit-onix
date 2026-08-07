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

export type NoEcossistema = {
  /**
   * Id interno e ESTÁVEL. Onde existe empresa correspondente em
   * `empresas-config.ts`, o id é o MESMO (`investimentos`, `corretora`,
   * `imobiliaria`, `corporate`, `tech`, `educacao`) — é essa igualdade que
   * vai permitir casar nó → permissão quando o RBAC entrar (ver `acesso.ts`).
   * `agro` e `contabil` ainda não existem em lugar nenhum do sistema.
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
   * Empresa sem rota própria ainda → borda tracejada + tag "Em construção".
   * INDEPENDENTE de acesso: um nó pode estar em construção e liberado, ou
   * pronto e bloqueado. São dois eixos diferentes e a UI mostra os dois.
   */
  emConstrucao?: boolean;
};

/**
 * Os 8 nós, em ordem HORÁRIA a partir das 12h. A ordem do array É a ordem
 * visual da órbita (o índice alimenta `posicaoOrbital`), então reordenar aqui
 * gira o desenho — é o único lugar que decide a posição de cada empresa.
 *
 * Quem tem rota: as 5 shells já entregues em `src/app/empresas/*` (elas
 * funcionam com NEXT_PUBLIC_NAV_V2 ligado ou desligado — a flag só controla a
 * barra de abas, não a existência da página).
 *
 * Quem NÃO tem rota (agro, educacao, contabil) nasce marcado `emConstrucao`.
 * Quando a página de cada uma entrar em `src/app/empresas/<slug>/`, basta
 * remover a marca — o href já aponta para o lugar certo.
 */
export const NOS_ECOSSISTEMA: readonly NoEcossistema[] = [
  { id: "investimentos", nome: "Onix Capital", href: "/empresas/investimentos", icon: "TrendingUp" },
  { id: "agro", nome: "Onix Agro", href: "/empresas/agro", icon: "Sprout", emConstrucao: true },
  { id: "corretora", nome: "Onix Corretora", href: "/empresas/corretora", icon: "ShieldCheck" },
  { id: "corporate", nome: "Onix Corporate", href: "/empresas/corporate", icon: "Building2" },
  { id: "imobiliaria", nome: "Onix Imob", href: "/empresas/imobiliaria", icon: "Home" },
  { id: "tech", nome: "Onix Tech", href: "/empresas/tech", icon: "Cpu" },
  /* Id `educacao` para casar com `empresas-config.ts`; o rótulo aqui é
   * "Onix Educacional" (protótipo aprovado do hub) enquanto a Central de
   * Implementações ainda chama de "Onix Educação". Divergência consciente:
   * unificar o nome é decisão de produto, não de layout. */
  { id: "educacao", nome: "Onix Educacional", href: "/empresas/educacao", icon: "GraduationCap", emConstrucao: true },
  { id: "contabil", nome: "Onix Contábil", href: "/empresas/contabil", icon: "Calculator", emConstrucao: true },
] as const;

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
