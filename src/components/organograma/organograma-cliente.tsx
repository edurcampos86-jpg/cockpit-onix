"use client";

import { createElement, useState } from "react";
import Link from "next/link";
import {
  BadgeCheck,
  Banknote,
  BookOpen,
  Briefcase,
  Building2,
  Calculator,
  ChevronDown,
  Circle,
  ClipboardList,
  Coins,
  Cpu,
  LayoutDashboard,
  Layers,
  Lock,
  Megaphone,
  Moon,
  Rocket,
  Scale,
  ScrollText,
  Shield,
  ShieldCheck,
  Sprout,
  Sun,
  TrendingUp,
  Umbrella,
  Users,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useTheme } from "@/components/theme-provider";
import { marcaDoNome, marcaPlana } from "@/lib/organograma/marca";
import { percorrer, type NoOrganograma } from "@/lib/organograma/arvore";
import { cn } from "@/lib/utils";

/* ──────────────────────────────────────────────────────────────
 * Organograma do grupo — a árvore inteira numa tela.
 *
 * Sem KPI e sem dado vivo: como o hub, é NAVEGAÇÃO. O que ele mostra é a
 * estrutura (`Empresa`), quem pode entrar (`locked`) e onde existe página
 * (`rota`) — nada além disso.
 *
 * ── TRÊS ESTADOS, INDEPENDENTES ─────────────────────────────────────────
 *   • acesso     (`locked`)      → cadeado, opacidade, clique morto;
 *   • rota       (`rota === null`) → sem link, mas legível e presente;
 *   • papel      (`consolida`)   → selo "consolida" na holding.
 * Um nó pode estar nos três ao mesmo tempo.
 *
 * `locked` é VITRINE: o nó continua visível. Esconder a caixa faria a pessoa
 * achar que o grupo é menor do que é — e a tela existe justamente para mostrar
 * o desenho inteiro. Quem desenha põe cadeado; não remove.
 * ────────────────────────────────────────────────────────────── */

/* Dourado do desenho aprovado do organograma. DIFERE do `--color-gold`
 * (#FFB114) do Cockpit e também do #C9A227 do hub: é a cor da assinatura desta
 * tela, e vale nos dois temas. Fica local até virar token — promover a cor
 * antes de a tela existir arrastaria o Cockpit inteiro atrás de uma decisão
 * que ainda está atrás de flag. */
const OURO = "#C9922E";

/* A serifada vem por `next/font` na casca de servidor, como `--font-serif`.
 * NÃO se usa o utilitário `font-serif` do Tailwind: no Tailwind 4 ele resolve
 * para a pilha padrão, e mapeá-lo para esta variável no `@theme` colocaria no
 * globals.css uma família que só existe dentro desta tela — toda outra página
 * que um dia usasse `font-serif` cairia numa variável indefinida.
 *
 * Aqui a pilha é local e a reserva é real: sem a variável (fonte ainda
 * baixando, ou bloqueada), o texto cai em Georgia em vez de virar sans. */
const SERIFADA = "var(--font-serif), Georgia, 'Times New Roman', serif";

/* As três forças do mesmo dourado, como variáveis CSS — é o que permite usá-lo
 * em `hover:` e em `bg-`, que inline style não alcança. Um objeto só, aplicado
 * onde o dourado é necessário. */
const estiloOuro = {
  "--ouro": OURO,
  "--ouro-suave": "rgba(201,146,46,.42)",
  "--ouro-fraco": "rgba(201,146,46,.13)",
} as React.CSSProperties;

const SEM_ACESSO = "Sem acesso — fale com Eduardo";
const SEM_PAGINA = "Ainda sem página";

/* Ícone por id do nó. Casado com `Empresa.id`, não com o rótulo: o nome muda
 * (a `imobiliaria` já viveu meses como "Onix Imobiliária"), o id não.
 * `Circle` é o fallback — id novo no banco entra na tela sem ícone bonito, mas
 * ENTRA. Uma tela que some com o nó porque o mapa não foi atualizado é pior
 * que uma bolinha. */
type ComponenteIcone = React.ComponentType<{ className?: string; style?: React.CSSProperties }>;

const ICONES: Record<string, ComponenteIcone> = {
  // Holding e seus departamentos
  "onix-co": Layers,
  "onix-co-expansao": Rocket,
  "onix-co-marketing": Megaphone,
  "onix-co-adm": Banknote,
  "onix-co-juridico": Scale,
  "onix-co-compliance": ShieldCheck,
  "onix-co-clientes": Users,
  // Empresas
  investimentos: TrendingUp,
  corretora: Umbrella,
  imobiliaria: Building2,
  educacao: BookOpen,
  tech: Cpu,
  contabil: Calculator,
  // Departamentos específicos
  agro: Sprout,
  "investimentos-investimentos": Coins,
  planejamento: ScrollText,
  "corretora-corretora": Shield,
  corporate: Briefcase,
};

/* As 5 funções transversais compartilham ícone entre empresas de propósito:
 * o "Jurídico" da Corretora e o da Tech são a MESMA função em casas
 * diferentes, e mostrar isso é metade do argumento do organograma. O sufixo do
 * id é o que identifica a função. */
const ICONES_TRANSVERSAIS: Record<string, ComponenteIcone> = {
  qualidade: BadgeCheck,
  adm: Banknote,
  juridico: Scale,
  compliance: ShieldCheck,
  backoffice: ClipboardList,
};

function iconeDo(no: NoOrganograma): ComponenteIcone {
  if (ICONES[no.id]) return ICONES[no.id];
  if (no.transversal) {
    const funcao = no.id.slice(no.id.lastIndexOf("-") + 1);
    if (ICONES_TRANSVERSAIS[funcao]) return ICONES_TRANSVERSAIS[funcao];
  }
  return Circle;
}

/* `createElement` em vez de `const Icone = iconeDo(no)` + `<Icone />`.
 *
 * Escolher o componente durante o render cria uma identidade nova a cada
 * passagem — o React desmonta e remonta o ícone em vez de atualizá-lo, e a
 * regra `react-hooks/static-components` acusa exatamente isso. Aqui a escolha
 * vira ARGUMENTO, e este componente é estável. */
function IconeNo({
  no,
  className,
  dourado,
}: {
  no: NoOrganograma;
  className: string;
  dourado?: boolean;
}) {
  return createElement(iconeDo(no), {
    className,
    style: dourado ? { color: OURO } : undefined,
  });
}

export function OrganogramaCliente({
  raizes,
  classeSerif,
}: {
  raizes: NoOrganograma[];
  classeSerif: string;
}) {
  const { theme, toggleTheme } = useTheme();
  const holding = raizes[0] ?? null;
  const total = percorrer(raizes).length;

  /* Banco vazio não é tela quebrada — é o seed que não rodou. Dizer isso é o
   * único comportamento honesto: desenhar o catálogo aqui mostraria 48 caixas
   * sobre uma tabela vazia, e o cadeado (que depende de linha existir) mentiria
   * junto. Mesma escolha do `resolver.ts`: a tela descreve o BANCO. */
  if (!holding) {
    return (
      <div className={cn(classeSerif, "flex min-h-full flex-col items-center justify-center gap-3 px-6 py-20 text-center")}>
        <h1 className="text-xl font-semibold text-foreground">Organograma vazio</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          Nenhuma linha em <code className="font-mono text-xs">Empresa</code>. A estrutura do grupo
          é semeada pelo workflow <strong>seed-empresas</strong>; enquanto ele não rodar, não há o
          que desenhar.
        </p>
        <Link
          href="/painel"
          className="mt-2 rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          Ir para o Painel de Comando
        </Link>
      </div>
    );
  }

  const empresas = holding.filhos.filter((f) => f.tipo === "empresa");
  /* Quem FAZ antes de quem SOMA. A ordem vem do banco alfabética, o que
   * intercala os dois papéis e deixa a fila visualmente aleatória. Reordenar
   * por `consolida` não inventa nada: é o campo que a #373 criou justamente
   * para separar os dois, e agrupá-lo faz a linha de selos dourados ler como
   * um bloco em vez de confete. Dentro de cada grupo, ordem alfabética. */
  const deptosDaHolding = holding.filhos
    .filter((f) => f.tipo !== "empresa")
    .slice()
    .sort((a, b) =>
      a.consolida === b.consolida
        ? a.nome.localeCompare(b.nome, "pt-BR")
        : Number(a.consolida) - Number(b.consolida),
    );
  const marca = marcaDoNome(holding.nome);

  return (
    <div className={cn(classeSerif, "flex min-h-full w-full flex-col")}>
      <h1 className="sr-only">Organograma do {holding.nome}</h1>

      <div className="flex items-center justify-between gap-2 px-4 pt-4">
        {/* A contagem sai do DADO, nunca de um número escrito à mão. O desenho
          * aprovado trazia "47 nós" no cabeçalho enquanto a própria lista dele
          * somava 48 — é exatamente o tipo de rótulo que envelhece sozinho no
          * dia em que alguém acrescenta um departamento. */}
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Organograma do grupo · {total} {total === 1 ? "nó" : "nós"}
        </p>

        <div className="flex items-center gap-1">
          <Link
            href="/painel"
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <LayoutDashboard className="h-4 w-4" />
            <span className="hidden sm:inline">Painel de Comando</span>
          </Link>

          <Tooltip>
            <TooltipTrigger
              type="button"
              onClick={toggleTheme}
              className="flex items-center justify-center rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label={theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro"}
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </TooltipTrigger>
            <TooltipContent side="left">
              {theme === "dark" ? "Tema claro" : "Tema escuro"}
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[1200px] px-4 pb-16 pt-6">
        {/* ── A marca ──────────────────────────────────────────── */}
        <div className="text-center">
          <p
            className="text-[clamp(2.25rem,7vw,3.25rem)] leading-none tracking-[-0.01em] text-foreground"
            style={{ fontFamily: SERIFADA }}
          >
            {marca.prefixo}
            <span style={{ color: OURO }}>{marca.sufixo}</span>
          </p>
          <p
            className="mt-2.5 text-[9.5px] font-semibold uppercase tracking-[0.34em]"
            style={{ color: OURO }}
          >
            Ecossistema
          </p>
          <p className="mt-3 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            {holding.tipo}
          </p>
          <div
            aria-hidden
            className="mx-auto mt-3.5 h-6 w-px"
            style={{ background: `linear-gradient(${OURO}, transparent)` }}
          />
        </div>

        {/* ── Departamentos da holding ─────────────────────────── */}
        {deptosDaHolding.length > 0 && (
          <ul className="mt-4 flex flex-wrap justify-center gap-2.5">
            {deptosDaHolding.map((no) => (
              <li key={no.id}>
                <NoDaHolding no={no} />
              </li>
            ))}
          </ul>
        )}

        {/* ── As empresas ──────────────────────────────────────── */}
        <div className="mt-8 flex items-center gap-3.5" aria-hidden>
          <span className="h-px flex-1 bg-border" />
          <span className="whitespace-nowrap text-[9.5px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
            {empresas.length} {empresas.length === 1 ? "empresa" : "empresas"}
          </span>
          <span className="h-px flex-1 bg-border" />
        </div>

        <ul className="mt-4 grid grid-cols-1 gap-3.5 md:grid-cols-2 xl:grid-cols-3">
          {empresas.map((empresa) => (
            <li key={empresa.id}>
              <CardDaEmpresa empresa={empresa} />
            </li>
          ))}
        </ul>

        <Legenda />
      </div>
    </div>
  );
}

/* ── Departamento da holding ────────────────────────────────── */

function NoDaHolding({ no }: { no: NoOrganograma }) {
  const conteudo = (
    <>
      <IconeNo no={no} className="h-3.5 w-3.5 shrink-0" dourado />
      <span>{no.nome}</span>
      {no.consolida && <SeloConsolida />}
      {no.locked && <Lock className="h-3 w-3 shrink-0 text-muted-foreground" />}
    </>
  );

  const classe =
    "flex items-center gap-2 rounded-[10px] border border-border bg-card px-3.5 py-2.5 text-[11.5px] font-semibold transition-colors";

  if (no.rota && !no.locked) {
    return (
      <Link href={no.rota} className={cn(classe, "hover:border-[var(--ouro)]")} style={estiloOuro}>
        {conteudo}
      </Link>
    );
  }

  /* O gatilho do tooltip É o elemento — o Tooltip daqui (Base UI) não tem
   * `asChild`, e envolver por fora deixaria o alvo sem foco de teclado. Um
   * botão que não navega continua sendo o alvo certo: ele é focável, e o
   * tooltip é a única resposta que a tela tem para dar. */
  return (
    <Tooltip>
      <TooltipTrigger
        type="button"
        className={cn(classe, "cursor-default text-left", no.locked && "opacity-60")}
      >
        {conteudo}
      </TooltipTrigger>
      <TooltipContent>{no.locked ? SEM_ACESSO : SEM_PAGINA}</TooltipContent>
    </Tooltip>
  );
}

/** O selo do departamento que SOMA o das seis empresas. */
function SeloConsolida() {
  return (
    <span
      className="rounded-full border px-1.5 py-px text-[8px] font-bold uppercase tracking-[0.09em]"
      style={{ color: OURO, borderColor: OURO }}
    >
      consolida
    </span>
  );
}

/* ── Card de empresa ────────────────────────────────────────── */

function CardDaEmpresa({ empresa }: { empresa: NoOrganograma }) {
  /* Aberto por padrão, nos DOIS tamanhos de tela. O desenho original decidia
   * isso com `matchMedia` no momento em que o script roda — o que aqui daria
   * HTML do servidor diferente do HTML do cliente e um aviso de hidratação a
   * cada carregamento. O que mantém o card curto no celular é o grupo das
   * transversais nascer FECHADO, que é o mesmo comportamento do desenho e não
   * depende de medir nada. */
  const [aberto, setAberto] = useState(true);
  const [transversaisAbertas, setTransversaisAbertas] = useState(false);

  const marca = marcaPlana(empresa.nome);
  const especificos = empresa.filhos.filter((f) => !f.transversal);
  const transversais = empresa.filhos.filter((f) => f.transversal);
  const temPagina = Boolean(empresa.rota) && !empresa.locked;
  const idCorpo = `organograma-${empresa.id}`;

  return (
    <div
      className={cn(
        "overflow-hidden rounded-[13px] border bg-card transition-colors",
        temPagina ? "border-[var(--ouro-suave)]" : "border-border",
        empresa.locked && "opacity-70",
      )}
      style={estiloOuro}
    >
      <div className="flex items-center gap-2.5 p-4">
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]",
            temPagina ? "bg-[var(--ouro-fraco)]" : "bg-accent",
          )}
        >
          <IconeNo no={empresa} className="h-[17px] w-[17px]" dourado={temPagina} />
        </span>

        <div className="min-w-0 flex-1">
          {/* O nome da empresa em caixa baixa é a MARCA (regra tipográfica de
            * `marca.ts`), mas quem lê com leitor de tela precisa do nome como
            * ele é. Daí o `title` e o texto acessível com o nome do banco. */}
          {temPagina ? (
            <Link
              href={empresa.rota as string}
              className="text-[19px] font-semibold leading-[1.1] hover:underline"
              style={{ fontFamily: SERIFADA }}
              title={empresa.nome}
            >
              {marca}
              <span className="sr-only"> — {empresa.nome}</span>
            </Link>
          ) : (
            <p
              className="text-[19px] font-semibold leading-[1.1]"
              style={{ fontFamily: SERIFADA }}
              title={empresa.nome}
            >
              {marca}
              <span className="sr-only"> — {empresa.nome}</span>
            </p>
          )}
          <p className="mt-0.5 text-[10px] tracking-[0.02em] text-muted-foreground">
            {empresa.filhos.length}{" "}
            {empresa.filhos.length === 1 ? "departamento" : "departamentos"}
            {empresa.locked ? " · sem acesso" : temPagina ? "" : " · sem página"}
          </p>
        </div>

        {empresa.locked && <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}

        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          aria-expanded={aberto}
          aria-controls={idCorpo}
          className="flex items-center justify-center rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label={aberto ? `Recolher ${empresa.nome}` : `Expandir ${empresa.nome}`}
        >
          <ChevronDown className={cn("h-[15px] w-[15px] transition-transform", !aberto && "-rotate-90")} />
        </button>
      </div>

      {aberto && (
        <div id={idCorpo} className="border-t border-border p-1.5">
          {especificos.map((no) => (
            <LinhaDeDepartamento key={no.id} no={no} />
          ))}

          {transversais.length > 0 && (
            <div className={cn("pt-1.5", especificos.length > 0 && "mt-0.5 border-t border-dashed border-border")}>
              <button
                type="button"
                onClick={() => setTransversaisAbertas((v) => !v)}
                aria-expanded={transversaisAbertas}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-[11.5px] font-semibold text-muted-foreground transition-colors hover:bg-accent"
              >
                <Layers className="h-[13px] w-[13px] shrink-0" style={{ color: OURO }} />
                {transversais.length} {transversais.length === 1 ? "área transversal" : "áreas transversais"}
                <ChevronDown
                  className={cn("ml-auto h-[13px] w-[13px] transition-transform", !transversaisAbertas && "-rotate-90")}
                />
              </button>

              {transversaisAbertas && (
                <div className="pl-1.5">
                  {transversais.map((no) => (
                    <LinhaDeDepartamento key={no.id} no={no} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Linha de departamento ──────────────────────────────────── */

function LinhaDeDepartamento({ no }: { no: NoOrganograma }) {
  const vivo = Boolean(no.rota) && !no.locked;

  const conteudo = (
    <>
      <IconeNo no={no} className="h-3.5 w-3.5 shrink-0" dourado={vivo} />
      <span className="flex-1 font-medium">{no.nome}</span>
      {no.consolida && <SeloConsolida />}
      {no.locked && <Lock className="h-3 w-3 shrink-0 text-muted-foreground" />}
    </>
  );

  const classe = "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[12.5px] transition-colors";

  if (vivo) {
    return (
      <Link href={no.rota as string} className={cn(classe, "hover:bg-accent")}>
        {conteudo}
      </Link>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger
        type="button"
        className={cn(classe, "w-full cursor-default text-left text-muted-foreground")}
      >
        {conteudo}
      </TooltipTrigger>
      <TooltipContent>{no.locked ? SEM_ACESSO : SEM_PAGINA}</TooltipContent>
    </Tooltip>
  );
}

/* ── Legenda ────────────────────────────────────────────────── */

function Legenda() {
  return (
    <ul className="mt-7 flex flex-wrap gap-4 text-[11px] text-muted-foreground">
      <li className="flex items-center gap-1.5">
        <Circle className="h-2 w-2 fill-current" style={{ color: OURO }} />
        Página disponível
      </li>
      <li className="flex items-center gap-1.5">
        <Circle className="h-2 w-2 fill-current" />
        Ainda sem página
      </li>
      <li className="flex items-center gap-1.5">
        <Lock className="h-3 w-3" />
        Visível a todos · acesso restrito
      </li>
      <li className="flex items-center gap-1.5">
        <Layers className="h-3 w-3" style={{ color: OURO }} />
        Consolida todas as empresas
      </li>
    </ul>
  );
}
