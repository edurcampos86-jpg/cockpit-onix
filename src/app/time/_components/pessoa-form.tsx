import { CARGO_FAMILIAS, TEAM_ROLES } from "@/lib/team";
import {
  DOMINIOS_CORPORATIVOS,
  listaDominiosCorporativos,
} from "@/lib/dominios-corporativos";
import { CpfField } from "./cpf-field";
import { TelefoneField } from "./telefone-field";

type PessoaInput = {
  id?: string;
  nomeCompleto?: string;
  apelido?: string | null;
  cpf?: string;
  email?: string;
  telefone?: string | null;
  dataNascimento?: Date | null;
  cidade?: string | null;
  fotoUrl?: string | null;
  dataEntrada?: Date;
  cargoFamilia?: string;
  cargoTitulo?: string | null;
  teamRole?: string;
  codigoAssessorBtg?: string | null;
  filialId?: string;
  departamentoId?: string;
  equipeId?: string | null;
  lideradoPorId?: string | null;
  observacoes?: string | null;
};

type Option = { id: string; nome: string; cargoFamilia?: string; apelido?: string | null };
type FilialOption = { id: string; nome: string; isMatriz: boolean };
type EquipeOption = { id: string; nome: string; departamento: { id: string; nome: string } };

export function PessoaForm({
  action,
  pessoa,
  filiais,
  departamentos,
  equipes,
  lideres,
  submitLabel,
}: {
  action: (formData: FormData) => void | Promise<void>;
  pessoa?: PessoaInput;
  filiais: FilialOption[];
  departamentos: Option[];
  equipes: EquipeOption[];
  lideres: Option[];
  submitLabel: string;
}) {
  const isoDate = (d: Date | null | undefined): string =>
    d ? new Date(d).toISOString().slice(0, 10) : "";

  return (
    <form action={action} className="space-y-6">
      {pessoa?.id && <input type="hidden" name="id" value={pessoa.id} />}

      {/* ── Identificação ── */}
      <Section title="Identificação">
        <Field label="Nome completo *" name="nomeCompleto" defaultValue={pessoa?.nomeCompleto ?? ""} required colSpan={2} />
        <Field label="Apelido" name="apelido" defaultValue={pessoa?.apelido ?? ""} />
        {/* Máscara + conferência dos dígitos: é a chave de cruzamento com os
            relatórios do BTG, e CPF errado não dá sinal em lugar nenhum. */}
        <CpfField defaultValue={pessoa?.cpf} />
        {/* O e-mail é identidade, não contato: é UNIQUE e é o que liga a
            Pessoa ao login. Por isso a regra do domínio corporativo — e por
            isso ela aparece aqui, antes de o erro voltar do servidor. */}
        <Field
          label="Email corporativo *"
          name="email"
          type="email"
          defaultValue={pessoa?.email ?? ""}
          placeholder={`nome@${DOMINIOS_CORPORATIVOS[0]}`}
          hint={`Dá o acesso ao Cockpit e é revogado na saída — ${listaDominiosCorporativos()}`}
          required
        />
        {/* Único campo com JS: precisa de máscara ao digitar, e é o que
            alimenta o alerta de risco de evasão no WhatsApp. */}
        <TelefoneField defaultValue={pessoa?.telefone} />
        <Field label="Data de nascimento" name="dataNascimento" type="date" defaultValue={isoDate(pessoa?.dataNascimento)} />
        <Field label="Cidade" name="cidade" defaultValue={pessoa?.cidade ?? ""} />
      </Section>

      {/* ── Cargo & vínculo ── */}
      <Section title="Cargo & vínculo Onix">
        <SelectField
          label="Cargo (família) *"
          name="cargoFamilia"
          required
          defaultValue={pessoa?.cargoFamilia ?? ""}
          options={[{ value: "", label: "Selecione…" }, ...CARGO_FAMILIAS.map((c) => ({ value: c.value, label: c.label }))]}
        />
        <Field label="Título do cargo" name="cargoTitulo" defaultValue={pessoa?.cargoTitulo ?? ""} placeholder="Ex.: Sócio fundador, Assessor Sr" />

        <Field label="Data de entrada" name="dataEntrada" type="date" defaultValue={isoDate(pessoa?.dataEntrada) || new Date().toISOString().slice(0, 10)} />

        <SelectField
          label="Nível de acesso *"
          name="teamRole"
          required
          defaultValue={pessoa?.teamRole ?? "colaborador"}
          options={TEAM_ROLES.map((c) => ({ value: c.value, label: c.label }))}
        />

        {/* Opcional: só quem atende cliente no BTG tem esse código.
            Imobiliária, corretora e administrativo deixam em branco. */}
        <Field
          label="Código do assessor (BTG)"
          name="codigoAssessorBtg"
          defaultValue={pessoa?.codigoAssessorBtg ?? ""}
          placeholder="Ex.: 2108333 — em branco se não atende no BTG"
          hint="Liga a ficha à carteira: nº de clientes, PL e quem está sem reunião marcada."
          colSpan={2}
        />
      </Section>

      {/* ── Hierarquia organizacional ── */}
      <Section title="Hierarquia organizacional">
        <SelectField
          label="Filial *"
          name="filialId"
          required
          defaultValue={pessoa?.filialId ?? ""}
          options={[
            { value: "", label: "Selecione…" },
            ...filiais.map((f) => ({ value: f.id, label: `${f.nome}${f.isMatriz ? " (matriz)" : ""}` })),
          ]}
        />
        <SelectField
          label="Departamento *"
          name="departamentoId"
          required
          defaultValue={pessoa?.departamentoId ?? ""}
          options={[{ value: "", label: "Selecione…" }, ...departamentos.map((d) => ({ value: d.id, label: d.nome }))]}
        />
        <SelectField
          label="Equipe"
          name="equipeId"
          defaultValue={pessoa?.equipeId ?? ""}
          options={[
            { value: "", label: "— sem equipe —" },
            ...equipes.map((e) => ({ value: e.id, label: `${e.nome} (${e.departamento.nome})` })),
          ]}
        />
        <SelectField
          label="Líder direto (a quem reporta)"
          name="lideradoPorId"
          defaultValue={pessoa?.lideradoPorId ?? ""}
          options={[
            { value: "", label: "— ninguém / reporta ao Eduardo —" },
            ...lideres.map((l) => ({ value: l.id, label: l.apelido ? `${l.nome} (${l.apelido})` : l.nome })),
          ]}
        />
      </Section>

      {/* ── Observações ── */}
      <Section title="Observações internas (admin only)">
        <div className="md:col-span-2">
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">Notas livres</label>
          <textarea
            name="observacoes"
            defaultValue={pessoa?.observacoes ?? ""}
            rows={4}
            className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            placeholder="Anotações internas — só admin lê. Histórico, contexto, alertas…"
          />
        </div>
      </Section>

      {/* ── Ações ── */}
      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card p-6">
      <h2 className="text-sm font-semibold text-foreground mb-4">{title}</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  name,
  type = "text",
  defaultValue,
  placeholder,
  required,
  colSpan,
  hint,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string;
  placeholder?: string;
  required?: boolean;
  colSpan?: 1 | 2;
  hint?: string;
}) {
  return (
    <div className={colSpan === 2 ? "md:col-span-2" : undefined}>
      <label htmlFor={name} className="block text-xs font-medium text-muted-foreground mb-1.5">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        defaultValue={defaultValue}
        placeholder={placeholder}
        required={required}
        className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
      />
      {hint && <span className="mt-1 block text-[11px] text-muted-foreground">{hint}</span>}
    </div>
  );
}

function SelectField({
  label,
  name,
  defaultValue,
  options,
  required,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  options: Array<{ value: string; label: string }>;
  required?: boolean;
}) {
  return (
    <div>
      <label htmlFor={name} className="block text-xs font-medium text-muted-foreground mb-1.5">
        {label}
      </label>
      <select
        id={name}
        name={name}
        defaultValue={defaultValue}
        required={required}
        className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
