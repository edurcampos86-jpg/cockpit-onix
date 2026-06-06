export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/layout/page-header";
import { StorysellingBiblioteca } from "@/components/backoffice/storyselling-biblioteca";
import { ReferenciaLivro } from "@/components/backoffice/referencia-livro";
import { ComoFunciona } from "@/components/backoffice/como-funciona";
import { REF_STORY_ANALOGIAS } from "@/lib/backoffice/referencias";

export default async function StorysellingPage() {
  let historias: Array<{
    id: string;
    titulo: string;
    categoria: string;
    analogia: string;
    quandoUsar: string | null;
    tags: string | null;
  }> = [];
  try {
    historias = await prisma.storyAnalogia.findMany({
      orderBy: [{ categoria: "asc" }, { criadoEm: "desc" }],
    });
  } catch {
    // tabela ainda pode não existir
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Biblioteca de Storyselling"
        description="Analogias e histórias para tornar o complexo simples e memorável."
      />
      <div className="px-8 space-y-6">
        <ComoFunciona
          proposito="Coleção de analogias e metáforas prontas para explicar conceitos financeiros de forma simples e emocional."
          comoUsar="Antes de uma reunião, busque pelo tema (aposentadoria, risco, sucessão...) e leve uma história pronta para contar."
          comoAjuda="O cliente esquece números, mas lembra de histórias. Aumenta engajamento, confiança e fechamento."
        />
        <ReferenciaLivro
          referencias={REF_STORY_ANALOGIAS}
          titulo="Por que histórias vendem mais que números"
        />
        <StorysellingBiblioteca historias={historias} />
      </div>
    </div>
  );
}
