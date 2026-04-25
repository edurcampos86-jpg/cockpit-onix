import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { requireAdmin } from "@/lib/auth-helpers";
import {
  listFiliais,
  listDepartamentos,
  listEquipes,
  listLiderancaCandidates,
} from "@/lib/team";
import { createPessoaAndRedirect } from "@/app/actions/time";
import { PessoaForm } from "../_components/pessoa-form";

export const metadata = {
  title: "Nova pessoa — Time — Cockpit Onix",
};

export default async function NovaPessoaPage() {
  await requireAdmin();

  const [filiais, departamentos, equipes, lideres] = await Promise.all([
    listFiliais(),
    listDepartamentos(),
    listEquipes(),
    listLiderancaCandidates(),
  ]);

  return (
    <div className="min-h-screen">
      <PageHeader
        title="Nova pessoa"
        description="Cadastrar um novo membro do time"
      >
        <Link
          href="/time"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          Voltar
        </Link>
      </PageHeader>

      <div className="p-8 max-w-3xl">
        <PessoaForm
          action={createPessoaAndRedirect}
          filiais={filiais}
          departamentos={departamentos}
          equipes={equipes.map((e) => ({
            id: e.id,
            nome: e.nome,
            departamento: { id: e.departamento.id, nome: e.departamento.nome },
          }))}
          lideres={lideres.map((l) => ({
            id: l.id,
            nome: l.nomeCompleto,
            apelido: l.apelido,
            cargoFamilia: l.cargoFamilia,
          }))}
          submitLabel="Cadastrar pessoa"
        />
      </div>
    </div>
  );
}
