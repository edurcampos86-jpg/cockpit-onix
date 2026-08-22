"use client";

import { HelpCircle } from "lucide-react";

import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { RICE_CAMPOS, RICE_EIXOS } from "@/lib/rice";

/**
 * Ícone de ajuda (?) discreto que abre um popover explicando, de forma
 * resumida, como funciona a priorização RICE. Reutiliza o Popover do design
 * system; acessível (button nativo + aria-label) e responsivo.
 *
 * A régua vem de `RICE_CAMPOS` (lib/rice.ts), não de uma lista escrita aqui.
 * Este texto e o servidor tinham cada um a sua cópia da escala, e elas
 * divergiram: a ajuda ensinava "0,5 baixo, 0,25 mínimo" enquanto a coluna
 * `impact` é inteira e trunca 0,5 para 0 — quem seguia a instrução via o score
 * do próprio item sumir sem mensagem nenhuma. Régua duplicada é régua que mente;
 * com uma fonte só, corrigir o valor conserta os dois lugares de uma vez.
 */
export function RiceHelp({ v2 = false }: { v2?: boolean }) {
  return (
    <Popover>
      <PopoverTrigger
        aria-label="Como a prioridade é calculada"
        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-muted-foreground/70 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <HelpCircle className="h-4 w-4" />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="max-w-[calc(100vw-2rem)] gap-3 text-xs leading-relaxed"
      >
        <PopoverHeader>
          <PopoverTitle className="text-sm">Como a prioridade é calculada</PopoverTitle>
        </PopoverHeader>

        <div className="space-y-2 text-muted-foreground">
          <p>O RICE prioriza ideias por retorno ajustado ao esforço.</p>
          <p className="rounded-md bg-muted px-2 py-1 font-mono text-[11px] text-foreground">
            {/* Os dois ramos em português. O ramo v2=false ainda calcula sem
                dividir a confiança por 100 — a fórmula muda, o idioma não. */}
            {v2
              ? "Score = Alcance × Impacto × (Confiança ÷ 100) ÷ Esforço"
              : "Score = (Alcance × Impacto × Confiança) ÷ Esforço"}
          </p>

          <ul className="space-y-1.5">
            {RICE_EIXOS.map((eixo) => {
              const campo = RICE_CAMPOS[eixo];
              return (
                <li key={eixo}>
                  <span className="font-semibold text-foreground">
                    {campo.nome} ({campo.sigla}):
                  </span>{" "}
                  {campo.ajuda} <span className="italic">{campo.unidade}.</span>
                </li>
              );
            })}
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
