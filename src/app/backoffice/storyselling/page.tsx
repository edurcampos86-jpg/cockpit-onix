export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/layout/page-header";
import { StorysellingBiblioteca } from "@/components/backoffice/storyselling-biblioteca";
import { ReferenciaLivro } from "@/components/backoffice/referencia-livro";
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
        <ReferenciaLivro
          referencias={REF_STORY_ANALOGIAS}
          titulo="Por que histórias vendem mais que números"
        />
        <StorysellingBiblioteca historias={historias} />
      </div>
    </div>
  );
}
