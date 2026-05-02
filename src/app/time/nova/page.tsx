import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { ComoFunciona } from "@/components/layout/como-funciona";
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
  title: "Nova pessoa — Time — Ecossistema Onix",
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

      <div className="p-8 max-w-3xl space-y-6">
        <ComoFunciona
          proposito="Cadastro de uma nova pessoa no time: identificação, vínculo Onix (entrada/cargo) e hierarquia organizacional (filial, departamento, equipe, liderança)."
          comoUsar="Preencha os campos obrigatórios — nome, CPF, email e dados do vínculo. Liderança é opcional (deixe em branco se reporta direto ao Eduardo). Depois de salvar, gera o convite de acesso pela ficha da pessoa."
          comoAjuda="Mantém o organograma sempre atualizado, alimenta automaticamente as relações de chefia, e habilita os módulos PAT, acordo comercial e onboarding pra esse membro."
        />
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
