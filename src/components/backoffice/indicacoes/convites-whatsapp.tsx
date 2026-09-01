"use client";

import { Dumbbell, Sun, UtensilsCrossed, Drama, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/* ──────────────────────────────────────────────────────────────
 * Convites sociais por WhatsApp — o evento social É o canal (Oechsli).
 *
 * 100% client-side: deep link `wa.me`, sem API nova. Mensagens no tom
 * amigo-para-amigo, clube fechado (Kennedy) — zero menção a investimentos,
 * Onix ou agenda; cada uma fecha em pergunta de resposta fácil.
 * ────────────────────────────────────────────────────────────── */

export type TipoConvite = "treino" | "praia" | "mesa" | "teatro";

const CONVITES: readonly {
  tipo: TipoConvite;
  icon: LucideIcon;
  ariaLabel: (nome: string) => string;
  mensagem: (nome: string) => string;
}[] = [
  {
    tipo: "treino",
    icon: Dumbbell,
    ariaLabel: (nome) => `Convidar ${nome} para treinar pelo WhatsApp`,
    mensagem: (nome) =>
      `E aí, ${nome}! Sábado vou treinar cedo e sobrou uma vaga do meu lado. Topa puxar ferro junto?`,
  },
  {
    tipo: "praia",
    icon: Sun,
    ariaLabel: (nome) => `Convidar ${nome} para a praia pelo WhatsApp`,
    mensagem: (nome) =>
      `${nome}, o fim de semana promete sol e estamos armando uma praia com a turma. Tem um lugar aí com seu nome — bora?`,
  },
  {
    tipo: "mesa",
    icon: UtensilsCrossed,
    ariaLabel: (nome) => `Convidar ${nome} para almoçar ou jantar pelo WhatsApp`,
    mensagem: (nome) =>
      `${nome}, descobri um restaurante daqueles que a gente sai comentando. Marco uma mesa pra gente essa semana?`,
  },
  {
    tipo: "teatro",
    icon: Drama,
    ariaLabel: (nome) => `Convidar ${nome} para o teatro pelo WhatsApp`,
    mensagem: (nome) =>
      `${nome}, consegui dois lugares bons pra uma peça que quero muito ver — e lembrei de você na hora. Vem comigo?`,
  },
];

/**
 * Telefone livre → deep link wa.me. Sanitiza dígitos e prefixa 55 quando o
 * número parece nacional: 10–11 dígitos é DDD+número (com DDI seriam 12–13).
 * Decidir por comprimento, e não por `startsWith("55")` — DDD 55 existe
 * (região de Santa Maria/RS) e um "(55) 99999-0000" precisa do prefixo.
 */
export function montarLinkWhatsApp(telefone: string, mensagem: string): string {
  let digits = telefone.replace(/\D/g, "");
  if (digits.length >= 10 && digits.length <= 11) {
    digits = `55${digits}`;
  }
  return `https://wa.me/${digits}?text=${encodeURIComponent(mensagem)}`;
}

export function primeiroNome(nomeCompleto: string): string {
  return nomeCompleto.trim().split(/\s+/)[0] || nomeCompleto;
}

const classesBotao = cn(
  buttonVariants({ variant: "ghost", size: "icon-sm" }),
  "text-muted-foreground hover:text-primary"
);

export function ConvitesWhatsApp({
  nomeIndicado,
  telefone,
}: {
  nomeIndicado: string;
  telefone: string | null;
}) {
  const nome = primeiroNome(nomeIndicado);
  const temTelefone = !!telefone?.trim();

  return (
    <div className="border-t border-border pt-2 flex items-center gap-2">
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
        Convidar para
      </span>
      <div className="flex gap-1">
        {CONVITES.map(({ tipo, icon: Icon, ariaLabel, mensagem }) => (
          <Tooltip key={tipo}>
            {temTelefone ? (
              <TooltipTrigger
                render={
                  // Link real (não window.open): navegável por teclado e por
                  // long-press no mobile.
                  <a
                    href={montarLinkWhatsApp(telefone as string, mensagem(nome))}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={ariaLabel(nome)}
                    className={classesBotao}
                  >
                    <Icon className="h-4 w-4" />
                  </a>
                }
              />
            ) : (
              <TooltipTrigger
                render={
                  // SEM `disabled` real: elemento disabled não recebe hover nem
                  // foco — o tooltip nunca abriria. `aria-disabled` mantém o
                  // botão focável e a dica acessível.
                  <button
                    type="button"
                    aria-disabled="true"
                    aria-label={ariaLabel(nome)}
                    onClick={(e) => e.preventDefault()}
                    className={cn(classesBotao, "opacity-40 cursor-not-allowed hover:text-muted-foreground")}
                  >
                    <Icon className="h-4 w-4" />
                  </button>
                }
              />
            )}
            <TooltipContent>
              {temTelefone
                ? ariaLabel(nome)
                : "Sem WhatsApp cadastrado. Adicione o número para convidar."}
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </div>
  );
}
