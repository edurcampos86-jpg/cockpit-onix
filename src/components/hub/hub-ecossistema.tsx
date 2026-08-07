"use client";

import Link from "next/link";
import {
  Building2,
  Calculator,
  Circle,
  Cpu,
  GraduationCap,
  Home,
  Lock,
  Moon,
  ShieldCheck,
  Sprout,
  Sun,
  TrendingUp,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useTheme } from "@/components/theme-provider";
import { AsaOnix } from "@/components/hub/asa-onix";
import { posicaoOrbital, type NoEcossistemaResolvido } from "@/lib/hub-ecossistema/nos";
import { cn } from "@/lib/utils";

/* ──────────────────────────────────────────────────────────────
 * Hub "Ecossistema Onix" — núcleo + 8 nós em órbita.
 *
 * Sem KPI e sem dado vivo de propósito: o hub é só navegação. Nenhuma query
 * roda para montar esta tela (a page faz um early return antes do Promise.all
 * do Painel de Comando).
 *
 * Dois eixos de estado, INDEPENDENTES:
 *   • acesso      (`locked`)      → opacidade + cadeado + tooltip, clique morto;
 *   • maturidade  (`emConstrucao`) → borda tracejada + tag, clique vivo.
 * Um nó pode estar nos dois ao mesmo tempo.
 * ────────────────────────────────────────────────────────────── */

/* Mapa nome (string da config) -> componente lucide, mesmo idioma do
 * EmpresaShell. `Circle` é o fallback: ícone errado na config nunca quebra
 * a tela inteira. */
const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  TrendingUp,
  Sprout,
  ShieldCheck,
  Building2,
  Home,
  Cpu,
  GraduationCap,
  Calculator,
};

/* Dourado do protótipo aprovado do hub. DIFERE do `--color-gold` (#FFB114) que
 * o resto do Cockpit usa — é a cor da assinatura "ECOSSISTEMA", mais fechada,
 * e vale nos dois temas. Fica local até virar token, para não mexer no
 * globals.css e arrastar o Cockpit inteiro atrás de uma tela atrás de flag. */
const OURO_ECOSSISTEMA = "#C9A227";

const TOOLTIP_SEM_ACESSO = "Sem acesso — fale com Eduardo";

export function HubEcossistema({ nos }: { nos: NoEcossistemaResolvido[] }) {
  const { theme, toggleTheme } = useTheme();

  return (
    /* `@container` (e não breakpoint de viewport) porque o hub vive ao lado da
     * sidebar do Cockpit: a 680px de JANELA sobra bem menos que 680px de
     * ESPAÇO, e a órbita se atropelaria. Medindo a própria caixa, o corte de
     * 680px significa o que deveria significar — e continua valendo quando a
     * sidebar recolhe. É também o que faz `cqw` existir para o raio.
     *
     * O container é uma casca SEM padding de propósito: a consulta de container
     * mede o content-box, então padding aqui viraria desconto silencioso no
     * corte (com `px-4` o "680px" só disparava a 712px de caixa). O respiro
     * mora na camada de dentro. */
    <div className="@container flex min-h-full w-full flex-col">
      <h1 className="sr-only">Ecossistema Onix</h1>

      <div className="flex justify-end px-4 pt-4">
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

      <div className="flex flex-1 flex-col justify-center px-4 pb-12">
        {/* ── Órbita (container ≥ 680px) ──────────────────────
         * O raio é uma custom property; cada nó se posiciona com
         * `calc(50% + var(--raio-orbita) * fator)`. Sem medir nada em JS:
         * nada de ResizeObserver, nada de estado, e o HTML do server é
         * idêntico ao do client (os fatores são constantes do índice).
         *
         * `clamp(200px, 24cqw, 300px)`: o piso de 200px é o que mantém o canto
         * interno dos cartões diagonais fora do núcleo (a 180px eles encostavam
         * no anel logo acima do corte de 680px); o teto de 300px impede a órbita
         * de esticar demais em monitor largo. */}
        <div
          className="relative mx-auto hidden w-full @min-[680px]:block"
          style={
            {
              "--raio-orbita": "clamp(200px, 24cqw, 300px)",
              height: "calc(var(--raio-orbita) * 2 + 180px)",
            } as React.CSSProperties
          }
        >
          <span
            aria-hidden="true"
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed"
            style={{
              width: "calc(var(--raio-orbita) * 2)",
              height: "calc(var(--raio-orbita) * 2)",
              borderColor: `${OURO_ECOSSISTEMA}33`,
            }}
          />

          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <NucleoOnix />
          </div>

          {nos.map((no, indice) => {
            const { fatorX, fatorY } = posicaoOrbital(indice, nos.length);
            return (
              <div
                key={no.id}
                className="absolute w-32 -translate-x-1/2 -translate-y-1/2"
                style={{
                  left: `calc(50% + (var(--raio-orbita) * ${fatorX}))`,
                  top: `calc(50% + (var(--raio-orbita) * ${fatorY}))`,
                }}
              >
                <NoDoHub no={no} />
              </div>
            );
          })}
        </div>

        {/* ── Grade 2 colunas (container < 680px) ──────────────
         * DOM próprio em vez de reposicionar o mesmo: as duas formas não
         * compartilham nada além do cartão, e alternar por CSS evita o
         * flash de layout errado que um `matchMedia` em efeito produziria
         * na primeira pintura. */}
        <div className="@min-[680px]:hidden">
          <div className="flex justify-center py-8">
            <NucleoOnix compacto />
          </div>
          <div className="mx-auto grid max-w-md grid-cols-2 gap-3">
            {nos.map((no) => (
              <NoDoHub key={no.id} no={no} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Núcleo: asa placeholder + wordmark "Onix" + assinatura "ECOSSISTEMA". */
function NucleoOnix({ compacto = false }: { compacto?: boolean }) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-full border bg-card text-center",
        compacto ? "h-40 w-40" : "h-44 w-44 @min-[900px]:h-52 @min-[900px]:w-52",
      )}
      style={{
        borderColor: `${OURO_ECOSSISTEMA}66`,
        boxShadow: `0 0 0 10px ${OURO_ECOSSISTEMA}0f`,
      }}
    >
      <span style={{ color: OURO_ECOSSISTEMA }}>
        <AsaOnix className="h-7 w-16" />
      </span>
      <span className="mt-1.5 text-3xl font-bold leading-none tracking-tight text-foreground">
        Onix
      </span>
      {/* O padding-left compensa o letter-spacing sobrando à direita da última
       * letra — sem ele a palavra fica visivelmente fora do eixo do wordmark. */}
      <span
        className="mt-2.5 pl-[0.42em] text-[0.62rem] font-semibold uppercase leading-none tracking-[0.42em]"
        style={{ color: OURO_ECOSSISTEMA }}
      >
        Ecossistema
      </span>
    </div>
  );
}

/**
 * Um nó. Bloqueado vira botão inerte com tooltip; liberado vira link — mesmo
 * quando está "em construção", porque a rota pode não existir ainda e o 404
 * padrão do Next é o comportamento combinado para esta fase.
 */
function NoDoHub({ no }: { no: NoEcossistemaResolvido }) {
  if (no.locked) {
    return (
      <Tooltip>
        <TooltipTrigger
          type="button"
          aria-disabled="true"
          className="block w-full cursor-not-allowed"
        >
          <CartaoNo no={no} />
          {/* O tooltip só é anunciado quando abre; este texto garante que o
           * motivo do bloqueio chegue ao leitor de tela sempre. */}
          <span className="sr-only">{TOOLTIP_SEM_ACESSO}</span>
        </TooltipTrigger>
        <TooltipContent side="top">{TOOLTIP_SEM_ACESSO}</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Link
      href={no.href}
      className="block w-full rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <CartaoNo no={no} />
    </Link>
  );
}

/**
 * Corpo visual do nó. Montado só com <span> (e não <div>) porque no estado
 * bloqueado ele vive dentro de um <button> — conteúdo de fluxo ali dentro é
 * HTML inválido.
 */
function CartaoNo({ no }: { no: NoEcossistemaResolvido }) {
  const Icone = ICONS[no.icon] ?? Circle;

  return (
    <span
      className={cn(
        "flex w-full flex-col items-center gap-2 rounded-2xl border bg-card px-2 py-3.5 text-center transition-all duration-200",
        no.emConstrucao ? "border-dashed" : "border-solid",
        no.locked
          ? "border-border opacity-45"
          : "border-border hover:-translate-y-0.5 hover:border-[#C9A227] hover:shadow-md",
      )}
    >
      <span className="relative flex h-11 w-11 items-center justify-center rounded-full bg-secondary">
        <Icone className="h-5 w-5 text-muted-foreground" />
        {no.locked && (
          <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-background">
            <Lock className="h-2.5 w-2.5 text-muted-foreground" />
          </span>
        )}
      </span>

      <span className="text-xs font-semibold leading-tight text-foreground">{no.nome}</span>

      {no.emConstrucao && (
        <span className="rounded-full border border-dashed border-border px-2 py-0.5 text-[0.58rem] font-medium uppercase tracking-wide text-muted-foreground">
          Em construção
        </span>
      )}
    </span>
  );
}
