import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getAuthContext, isAdmin } from "@/lib/auth-helpers";
import { PageHeader } from "@/components/layout/page-header";
import { ArrowLeft } from "lucide-react";
import { UploadForm } from "./_components/upload-form";

export const metadata = { title: "Novo contrato — Cockpit Onix" };
export const dynamic = "force-dynamic";

export default async function NovoContratoPage() {
  const ctx = await getAuthContext().catch(() => null);
  if (!ctx) redirect("/login");
  if (!isAdmin(ctx)) redirect("/");

  const pessoas = await prisma.pessoa.findMany({
    where: { status: "ativo" },
    select: { id: true, apelido: true, nomeCompleto: true, cpf: true },
    orderBy: { nomeCompleto: "asc" },
  });

  return (
    <div className="min-h-screen">
      <PageHeader
        title="Subir contrato"
        description="PDF até 20MB. Após upload, Claude extrai os dados em background."
      >
        <Link
          href="/juridico/contratos"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Link>
      </PageHeader>

      <div className="p-8 max-w-2xl">
        <UploadForm pessoas={pessoas} />
      </div>
    </div>
  );
}
