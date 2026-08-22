"use client";

import { Bot, Building2, Hand, Presentation } from "lucide-react";
import { ROTULO_ORIGEM, type OrigemCampo } from "@/lib/clientes-registro/proveniencia";

/**
 * Selo de origem de um campo editável da ficha.
 *
 * Responde, ao lado do próprio campo, "quem escreveu o que está aqui?". A
 * pergunta passou a ter peso quando a transcrição virou fonte: sem o selo,
 * texto sugerido pela máquina e texto conferido na conversa ficam com a mesma
 * cara, e o assessor repete na reunião seguinte uma coisa que o cliente nunca
 * disse.
 *
 * Sem proveniência → NÃO renderiza nada. Campo escrito antes desta tabela
 * existir não tem resposta, e "Origem desconhecida" seria ruído em toda ficha
 * antiga. Ausência de selo lê-se como ausência de informação, que é a verdade.
 */

const ICONE: Record<OrigemCampo, typeof Hand> = {
  manual: Hand,
  reuniao: Presentation,
  ia: Bot,
  base_btg: Building2,
  informacoes: Building2,
  api: Building2,
};

/** Só "ia" recebe cor de atenção: é a única origem que ninguém conferiu. */
const COR: Record<OrigemCampo, string> = {
  manual: "text-muted-foreground",
  reuniao: "text-muted-foreground",
  ia: "text-amber-600 dark:text-amber-500",
  base_btg: "text-muted-foreground",
  informacoes: "text-muted-foreground",
  api: "text-muted-foreground",
};

export type ProvenienciaView = {
  campo: string;
  origem: string;
  registradoEm: string;
  reuniaoData?: string | null;
};

function ehOrigemConhecida(o: string): o is OrigemCampo {
  return o in ROTULO_ORIGEM;
}

export function SeloOrigem({ proveniencia }: { proveniencia: ProvenienciaView | undefined }) {
  if (!proveniencia) return null;
  if (!ehOrigemConhecida(proveniencia.origem)) return null;

  const Icone = ICONE[proveniencia.origem];
  const quando = formatarData(proveniencia.registradoEm);

  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] ${COR[proveniencia.origem]}`}
      title={`${ROTULO_ORIGEM[proveniencia.origem]} · ${quando}`}
    >
      <Icone className="h-3 w-3" aria-hidden />
      {ROTULO_ORIGEM[proveniencia.origem]}
      <span className="text-muted-foreground">· {quando}</span>
    </span>
  );
}

/** Index por campo — a ficha busca o selo pelo endereço, não varre a lista. */
export function indexarProveniencias(
  lista: readonly ProvenienciaView[],
): Map<string, ProvenienciaView> {
  return new Map(lista.map((p) => [p.campo, p]));
}

function formatarData(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}
