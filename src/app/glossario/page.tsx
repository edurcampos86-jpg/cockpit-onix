import { PageHeader } from "@/components/layout/page-header";
import { ComoFunciona } from "@/components/layout/como-funciona";
import { BookMarked } from "lucide-react";

export const metadata = {
  title: "Glossário — Ecossistema Onix",
};

type Termo = {
  termo: string;
  area: "MKT" | "Corretora" | "Backoffice" | "Geral";
  definicao: string;
  exemplo?: string;
};

const TERMOS: Termo[] = [
  // Geral
  {
    termo: "Ecossistema Onix",
    area: "Geral",
    definicao:
      "Painel de gestão integrado da Onix Co com três módulos: MKT (mídias sociais), Corretora (gestão comercial) e Backoffice (carteira de clientes Supernova).",
  },
  {
    termo: "ComoFunciona",
    area: "Geral",
    definicao:
      "Bloco azul no topo de cada página explicando: do que se trata, como usar e como te ajuda. Está em todas as páginas para deixar o sistema autoexplicável.",
  },

  // MKT
  {
    termo: "Quadros Fixos",
    area: "MKT",
    definicao:
      "5 formatos editoriais recorrentes que estruturam o conteúdo da Onix nas redes: garante consistência semanal sem reinventar a roda.",
  },
  {
    termo: "Regra 80/20 de CTAs",
    area: "MKT",
    definicao:
      "Princípio editorial: 80% do conteúdo entrega valor sem pedir nada; 20% faz chamada explícita para ação. Mantém a audiência engajada sem cansá-la.",
  },
  {
    termo: "Funil AARRR",
    area: "MKT",
    definicao:
      "Modelo de métricas em 4 camadas — Aquisição, Ativação, Retenção, Receita — usado nos KPIs para medir cada estágio do relacionamento com a audiência.",
  },
  {
    termo: "Roteiros vs Templates",
    area: "MKT",
    definicao:
      "Template é o esqueleto reutilizável de um formato. Roteiro é o conteúdo específico para uma postagem real.",
  },

  // Corretora
  {
    termo: "PAT",
    area: "Corretora",
    definicao:
      "Perfil de Análise Transacional. Classificação comportamental dos vendedores que define como cada um pensa, decide e se comunica. Base para coaching personalizado.",
    exemplo: "Eduardo é PAT 76 (Promocional de Ação Livre) — sociável, comunicativo, flexível.",
  },
  {
    termo: "Score Semanal",
    area: "Corretora",
    definicao:
      "Nota de 0 a 100 atribuída pela IA na análise das conversas comerciais. ≥80 bom · 60-79 regular · <60 crítico.",
  },
  {
    termo: "Formato C",
    area: "Corretora",
    definicao:
      "Estrutura da reunião semanal: visão coletiva do time + análise individual calibrada pelo PAT de cada vendedor.",
  },
  {
    termo: "Plaud.ai",
    area: "Corretora",
    definicao:
      "Gravador de bolso usado para capturar reuniões. As transcrições alimentam o pipeline de análise comercial.",
  },
  {
    termo: "Negócio Adormecido",
    area: "Corretora",
    definicao:
      "Lead que não converteu mas pode ser reativado. O sistema agenda recontato (~60 dias) e notifica quando vence.",
  },
  {
    termo: "Pipeline Parado",
    area: "Corretora",
    definicao:
      "Negócio sem atividade há mais de 48h. Sinalizado em Alertas com prioridade alta/média/baixa pelo valor.",
  },
  {
    termo: "Padrões Coletivos",
    area: "Corretora",
    definicao:
      "Síntese gerada a partir dos relatórios individuais — gargalos comuns, oportunidades sistêmicas. Pauta da reunião de terça.",
  },

  // Backoffice
  {
    termo: "Método 12-4-2",
    area: "Backoffice",
    definicao:
      "Cadência de relacionamento com a carteira: 12 contatos leves, 4 reuniões, 2 reviews por ano. Estrutura para nunca perder cliente por esquecimento.",
  },
  {
    termo: "Carteira Supernova",
    area: "Backoffice",
    definicao:
      "Conjunto de clientes ativos sob gestão do backoffice. Cada cliente tem cadência, histórico e plano de ação próprio.",
  },
  {
    termo: "Storyselling",
    area: "Backoffice",
    definicao:
      "Técnica de vender por meio de histórias estruturadas — transforma dados frios em narrativa que o cliente lembra.",
  },
];

const AREAS = ["Geral", "MKT", "Corretora", "Backoffice"] as const;
const CORES: Record<typeof AREAS[number], string> = {
  Geral: "bg-slate-500/10 text-slate-400 border-slate-500/30",
  MKT: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  Corretora: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  Backoffice: "bg-violet-500/10 text-violet-400 border-violet-500/30",
};

export default function GlossarioPage() {
  return (
    <div className="min-h-screen">
      <PageHeader
        title="Glossário"
        description="Vocabulário comum do Ecossistema Onix — termos, siglas e conceitos usados no sistema"
      />

      <div className="p-8 space-y-6 max-w-5xl">
        <ComoFunciona
          proposito="Dicionário único de todos os termos, siglas e conceitos que aparecem no Ecossistema Onix — para que ninguém precise adivinhar o que algo significa."
          comoUsar="Procure pelo termo agrupado por área. Use como referência rápida quando encontrar uma sigla nova ou quando treinar alguém."
          comoAjuda="Onboarding instantâneo. Pessoa nova entende o vocabulário sem ter que perguntar. Reduz desalinhamento e acelera autonomia."
        />

        {AREAS.map((area) => {
          const termos = TERMOS.filter((t) => t.area === area);
          if (termos.length === 0) return null;
          return (
            <section key={area} className="space-y-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                <BookMarked className="h-4 w-4" />
                {area}
                <span className="text-xs font-normal text-muted-foreground/60">({termos.length})</span>
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {termos.map((t) => (
                  <div key={t.termo} className="rounded-xl border border-border bg-card p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="font-semibold text-sm">{t.termo}</h3>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border ${CORES[t.area]}`}>
                        {t.area}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{t.definicao}</p>
                    {t.exemplo && (
                      <p className="text-[11px] text-muted-foreground/80 mt-2 italic border-l-2 border-primary/30 pl-2">
                        Ex: {t.exemplo}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
