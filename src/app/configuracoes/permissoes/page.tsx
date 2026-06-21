import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getAuthContext, isAdmin } from "@/lib/auth-helpers";
import { permissoesUiHabilitado } from "@/lib/permissoes/flag";
import { PageHeader } from "@/components/layout/page-header";
import { PermissoesTabs, type PapelDTO } from "./permissoes-tabs";

export const dynamic = "force-dynamic";

export default async function PermissoesPage() {
  // Flag OFF → finge que a rota não existe.
  if (!(await permissoesUiHabilitado())) notFound();

  // Gate admin (segurança real; o nav é só cosmético).
  const ctx = await getAuthContext().catch(() => null);
  if (!ctx) redirect("/login");
  if (!isAdmin(ctx)) redirect("/");

  const papeis = await prisma.papel.findMany({
    orderBy: [{ adminGlobal: "desc" }, { nome: "asc" }],
    include: { permissoes: true },
  });

  const dto: PapelDTO[] = papeis.map((p) => ({
    id: p.id,
    nome: p.nome,
    isSistema: p.isSistema,
    escopoOperacional: p.escopoOperacional,
    adminGlobal: p.adminGlobal,
    permissoes: p.permissoes.map((pp) => ({ area: pp.area, nivel: pp.nivel })),
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Permissões & Acessos"
        description="Papéis do sistema, escopo operacional e permissões por área. Leitura e edição de papéis (sem enforcement ainda)."
      />
      <div className="px-8 pb-8">
        <PermissoesTabs papeis={dto} />
      </div>
    </div>
  );
}
