import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { ComoFunciona } from "@/components/layout/como-funciona";
import { requireAdmin } from "@/lib/auth-helpers";
import {
  getPessoa,
  listFiliais,
  listDepartamentos,
  listEquipes,
  listLiderancaCandidates,
  MOTIVOS_SAIDA,
} from "@/lib/team";
import {
  updatePessoaAndRedirect,
  archivePessoaForm,
  restorePessoaForm,
} from "@/app/actions/time";
import { PessoaForm } from "../../_components/pessoa-form";

export const metadata = {
  title: "Editar pessoa — Time — Ecossistema Onix",
};

export default async function EditarPessoaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;

  const pessoa = await getPessoa(id);
  if (!pessoa) notFound();

  const [filiais, departamentos, equipes, lideres] = await Promise.all([
    listFiliais(),
    listDepartamentos(),
    listEquipes(),
    listLiderancaCandidates(id),
  ]);

  const isArquivado = pessoa.status === "arquivado";

  return (
    <div className="min-h-screen">
      <PageHeader
        title={`Editar ${pessoa.apelido || pessoa.nomeCompleto}`}
        description="Atualizar dados de identificação, cargo e hierarquia"
      >
        <Link
          href={`/time/${id}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          Voltar
        </Link>
      </PageHeader>

      <div className="p-8 max-w-3xl space-y-6">
        <ComoFunciona
          proposito="Edição da ficha cadastral da pessoa: identificação, cargo, hierarquia e — quando a pessoa sai da Onix — arquivamento com data e motivo de saída."
          comoUsar="Edite o que precisar e clique Salvar. Pra arquivar (offboarding), use o bloco vermelho no fim, com data e motivo. Pessoa arquivada some das listas ativas mas mantém histórico."
          comoAjuda="Mantém o organograma sempre fiel à realidade e preserva a memória institucional de quem passou pelo time, sem deletar dados."
        />
        <PessoaForm
          action={updatePessoaAndRedirect}
          pessoa={{
            id: pessoa.id,
            nomeCompleto: pessoa.nomeCompleto,
            apelido: pessoa.apelido,
            cpf: pessoa.cpf,
            email: pessoa.email,
            telefone: pessoa.telefone,
            dataNascimento: pessoa.dataNascimento,
            cidade: pessoa.cidade,
            fotoUrl: pessoa.fotoUrl,
            dataEntrada: pessoa.dataEntrada,
            cargoFamilia: pessoa.cargoFamilia,
            cargoTitulo: pessoa.cargoTitulo,
            teamRole: pessoa.teamRole,
            filialId: pessoa.filialId,
            departamentoId: pessoa.departamentoId,
            equipeId: pessoa.equipeId,
            lideradoPorId: pessoa.lideradoPorId,
            observacoes: pessoa.observacoes,
          }}
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
          submitLabel="Salvar alterações"
        />

        {/* ── Zona de offboarding ── */}
        <section className="rounded-xl border border-destructive/30 bg-destructive/5 p-6">
          <h2 className="text-sm font-semibold text-destructive mb-1">
            {isArquivado ? "Restaurar pessoa" : "Arquivar pessoa (offboarding)"}
          </h2>
          <p className="text-xs text-muted-foreground mb-4">
            {isArquivado
              ? "Pessoa atualmente arquivada. Restaurar a torna ativa novamente, mas o histórico de saída é mantido até nova edição."
              : "Marca a pessoa como arquivada (não some — fica no histórico). Use quando alguém deixar a Onix."}
          </p>

          {isArquivado ? (
            <form action={restorePessoaForm}>
              <input type="hidden" name="id" value={pessoa.id} />
              <button
                type="submit"
                className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
              >
                Restaurar pessoa
              </button>
            </form>
          ) : (
            <form action={archivePessoaForm} className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
              <input type="hidden" name="id" value={pessoa.id} />
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                  Data de saída
                </label>
                <input
                  type="date"
                  name="dataSaida"
                  defaultValue={new Date().toISOString().slice(0, 10)}
                  required
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-destructive/30"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                  Motivo
                </label>
                <select
                  name="motivoSaida"
                  required
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-destructive/30"
                >
                  {MOTIVOS_SAIDA.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="submit"
                className="rounded-lg bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 transition-colors"
              >
                Arquivar
              </button>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}
