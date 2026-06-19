"use client";

import { HelpCircle } from "lucide-react";

import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";

const FATORES = [
  {
    label: "Reach (R):",
    texto: "quantos clientes ou eventos a ideia atinge no período.",
  },
  {
    label: "Impact (I):",
    texto:
      "força do efeito em cada um. 3 massivo, 2 alto, 1 médio, 0,5 baixo, 0,25 mínimo.",
  },
  {
    label: "Confidence (C):",
    texto: "quão confiável é a estimativa, em %. 100 alta, 80 média, 50 baixa.",
  },
  { label: "Effort (E):", texto: "custo de execução em pessoa-mês." },
] as const;

/**
 * Ícone de ajuda (?) discreto que abre um popover explicando, de forma
 * resumida, como funciona a priorização RICE. Reutiliza o Popover do design
 * system; acessível (button nativo + aria-label) e responsivo.
 */
export function RiceHelp() {
  return (
    <Popover>
      <PopoverTrigger
        aria-label="Como funciona o RICE"
        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-muted-foreground/70 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <HelpCircle className="h-4 w-4" />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="max-w-[calc(100vw-2rem)] gap-3 text-xs leading-relaxed"
      >
        <PopoverHeader>
          <PopoverTitle className="text-sm">Como funciona o RICE</PopoverTitle>
        </PopoverHeader>

        <div className="space-y-2 text-muted-foreground">
          <p>O RICE prioriza ideias por retorno ajustado ao esforço.</p>
          <p className="rounded-md bg-muted px-2 py-1 font-mono text-[11px] text-foreground">
            Score = (Reach × Impact × Confidence) ÷ Effort
          </p>

          <ul className="space-y-1.5">
            {FATORES.map((f) => (
              <li key={f.label}>
                <span className="font-semibold text-foreground">{f.label}</span>{" "}
                {f.texto}
              </li>
            ))}
          </ul>

          <p>
            Quanto maior o score, maior a prioridade. O score só é calculado com
            os quatro campos preenchidos.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
