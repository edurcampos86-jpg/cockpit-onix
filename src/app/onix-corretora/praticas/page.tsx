export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/layout/page-header";
import { ComoFunciona } from "@/components/layout/como-funciona";
import { BookOpen, Star, ChevronDown } from "lucide-react";

const VENDEDORES = ["Eduardo Campos", "Thiago Vergal", "Rose Oliveira"];

function extrairDestaques(secao1: string): string[] {
  // Tenta dividir por linhas que iniciam com numero, letra maiuscula ou marcador
  const linhas = secao1
    .split(/\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 30); // ignora linhas muito curtas

  // Agrupa por paragrafos coerentes
  const destaques: string[] = [];
  let buffer = "";

  for (const linha of linhas) {
    const isTitulo = /^(\d+[\.\):]|[A-Z]{2,}|Destaque|Ponto|Abordagem|Exemplo)/i.test(linha);
    if (isTitulo && buffer.length > 0) {
      destaques.push(buffer.trim());
      buffer = linha;
    } else {
      buffer += (buffer ? " " : "") + linha;
    }
  }
  if (buffer.trim().length > 0) destaques.push(buffer.trim());

  return destaques.slice(0, 5); // max 5 destaques por relatorio
}

export default async function PraticasPage() {
  const relatorios = await prisma.relatorio.findMany({
    orderBy: { periodoInicio: "desc" },
    take: 20,
    select: { id: true, vendedor: true, periodo: true, periodoInicio: true, secao1: true },
  });

  const porVendedor: Record<string, { periodo: string; periodoInicio: Date; id: string; destaques: string[] }[]> = {};

  for (const r of relatorios) {
    if (!porVendedor[r.vendedor]) porVendedor[r.vendedor] = [];
    const destaques = extrairDestaques(r.secao1);
    if (destaques.length > 0) {
      porVendedor[r.vendedor].push({ periodo: r.periodo, periodoInicio: r.periodoInicio, id: r.id, destaques });
    }
  }

  const temDados = Object.keys(porVendedor).length > 0;

  const initials: Record<string, string> = {
    "Eduardo Campos": "EC",
    "Thiago Vergal": "TV",
    "Rose Oliveira": "RO",
  };

  return (
    <div className="min-h-screen">
      <PageHeader
        title="Boas Praticas"
        description="Abordagens positivas extraidas dos relatorios semanais"
      />

      <div className="p-8 space-y-8">
        <ComoFunciona
          proposito="Biblioteca de abordagens positivas que cada vendedor usou nas conversas — extraídas automaticamente pela IA dos relatórios semanais."
          comoUsar="Leia os destaques de cada vendedor para identificar técnicas que funcionaram. Use como repertório de exemplos reais nas reuniões 1:1 e treinamentos."
          comoAjuda="Multiplica o que dá certo. Em vez de só apontar erros, replica acertos — transformando vitórias individuais em padrão do time."
        />

        {!temDados ? (
          <div className="rounded-xl border border-dashed border-border p-12 text-center">
            <BookOpen className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Nenhuma pratica registrada ainda</h3>
            <p className="text-sm text-muted-foreground">
              As boas praticas sao extraidas automaticamente dos relatorios gerados.
            </p>
          </div>
        ) : (
          VENDEDORES.map((vendedor) => {
            const semanas = porVendedor[vendedor];
            if (!semanas || semanas.length === 0) return null;

            return (
              <div key={vendedor} className="space-y-4">
                {/* Cabecalho do vendedor */}
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="text-primary text-sm font-bold">{initials[vendedor] ?? vendedor[0]}</span>
                  </div>
                  <div>
                    <h2 className="font-semibold">{vendedor}</h2>
                    <p className="text-xs text-muted-foreground">{semanas.length} semana{semanas.length !== 1 ? "s" : ""} com boas praticas</p>
                  </div>
                </div>

                {/* Cards por semana */}
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {semanas.slice(0, 6).map(({ id, periodo, destaques }) => (
                    <div key={id} className="rounded-xl border border-border bg-card p-5">
                      <div className="flex items-center gap-2 mb-4">
                        <Star className="h-4 w-4 text-yellow-400 shrink-0" />
                        <span className="text-xs font-semibold text-muted-foreground">{periodo}</span>
                      </div>
                      <ul className="space-y-3">
                        {destaques.map((d, i) => (
                          <li key={i} className="flex gap-2.5">
                            <span className="w-5 h-5 rounded-full bg-green-400/15 text-green-400 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                              {i + 1}
                            </span>
                            <p className="text-xs text-foreground/85 leading-relaxed">{d}</p>
                          </li>
                        ))}
                      </ul>
                      <a
                        href={`/onix-corretora/relatorios/${id}`}
                        className="block mt-4 text-center text-xs py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors font-medium"
                      >
                        Ver relatorio completo
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
