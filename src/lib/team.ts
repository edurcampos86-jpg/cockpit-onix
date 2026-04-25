import "server-only";
import { prisma } from "./prisma";

/* ──────────────────────────────────────────────────────────────────────────
   CONSTANTES — espelham os "enums via string" do schema.prisma (Pessoa).
   Mantenha sincronizado com prisma/schema.prisma.
   ────────────────────────────────────────────────────────────────────────── */

export const CARGO_FAMILIAS = [
  { value: "assessor_investimentos", label: "Assessor de Investimentos" },
  { value: "socio", label: "Sócio" },
  { value: "imobiliaria", label: "Imobiliária" },
  { value: "corretora", label: "Corretora" },
  { value: "qualidade", label: "Qualidade" },
  { value: "administrativo", label: "Administrativo" },
] as const;

export const TEAM_ROLES = [
  { value: "admin", label: "Admin" },
  { value: "lideranca", label: "Liderança" },
  { value: "colaborador", label: "Colaborador" },
] as const;

export const PESSOA_STATUS = [
  { value: "ativo", label: "Ativo" },
  { value: "arquivado", label: "Arquivado" },
] as const;

export const MOTIVOS_SAIDA = [
  { value: "demissao", label: "Demissão" },
  { value: "saida_voluntaria", label: "Saída voluntária" },
  { value: "fim_contrato", label: "Fim de contrato" },
  { value: "outro", label: "Outro" },
] as const;

export type CargoFamiliaValue = (typeof CARGO_FAMILIAS)[number]["value"];
export type TeamRoleValue = (typeof TEAM_ROLES)[number]["value"];
export type PessoaStatusValue = (typeof PESSOA_STATUS)[number]["value"];
export type MotivoSaidaValue = (typeof MOTIVOS_SAIDA)[number]["value"];

export function labelCargo(v: string | null | undefined): string {
  return CARGO_FAMILIAS.find((c) => c.value === v)?.label ?? "—";
}
export function labelTeamRole(v: string | null | undefined): string {
  return TEAM_ROLES.find((c) => c.value === v)?.label ?? "—";
}
export function labelStatus(v: string | null | undefined): string {
  return PESSOA_STATUS.find((c) => c.value === v)?.label ?? "—";
}
export function labelMotivoSaida(v: string | null | undefined): string {
  return MOTIVOS_SAIDA.find((c) => c.value === v)?.label ?? "—";
}

/* ──────────────────────────────────────────────────────────────────────────
   QUERIES — todas Server-side (chamadas em Server Components / Actions).
   ────────────────────────────────────────────────────────────────────────── */

export async function listFiliais() {
  return prisma.filial.findMany({
    orderBy: [{ isMatriz: "desc" }, { nome: "asc" }],
  });
}

export async function listDepartamentos() {
  return prisma.departamento.findMany({ orderBy: { nome: "asc" } });
}

export async function listEquipes() {
  return prisma.equipe.findMany({
    include: { departamento: { select: { id: true, nome: true } } },
    orderBy: { nome: "asc" },
  });
}

export type ListPessoasFilters = {
  status?: PessoaStatusValue | "todos";
  filialId?: string;
  departamentoId?: string;
  busca?: string;
};

export async function listPessoas(filters: ListPessoasFilters = {}) {
  const status = filters.status ?? "ativo";
  return prisma.pessoa.findMany({
    where: {
      ...(status !== "todos" ? { status } : {}),
      ...(filters.filialId ? { filialId: filters.filialId } : {}),
      ...(filters.departamentoId ? { departamentoId: filters.departamentoId } : {}),
      ...(filters.busca
        ? {
            OR: [
              { nomeCompleto: { contains: filters.busca, mode: "insensitive" } },
              { apelido: { contains: filters.busca, mode: "insensitive" } },
              { email: { contains: filters.busca, mode: "insensitive" } },
              { cpf: { contains: filters.busca } },
            ],
          }
        : {}),
    },
    include: {
      filial: { select: { id: true, nome: true } },
      departamento: { select: { id: true, nome: true } },
      equipe: { select: { id: true, nome: true } },
      lideradoPor: { select: { id: true, nomeCompleto: true, apelido: true } },
    },
    orderBy: [{ status: "asc" }, { nomeCompleto: "asc" }],
  });
}

export async function getPessoa(id: string) {
  return prisma.pessoa.findUnique({
    where: { id },
    include: {
      filial: true,
      departamento: true,
      equipe: { include: { departamento: true } },
      lideradoPor: {
        select: {
          id: true,
          nomeCompleto: true,
          apelido: true,
          fotoUrl: true,
          cargoFamilia: true,
        },
      },
      lidera: {
        where: { status: "ativo" },
        select: {
          id: true,
          nomeCompleto: true,
          apelido: true,
          fotoUrl: true,
          cargoFamilia: true,
        },
        orderBy: { nomeCompleto: "asc" },
      },
      equipesLideradas: { select: { id: true, nome: true } },
      user: { select: { id: true, email: true, role: true, avatarUrl: true } },
    },
  });
}

/** Candidatos a "líder direto" — pessoas ativas com role admin ou liderança. */
export async function listLiderancaCandidates(excludeId?: string) {
  return prisma.pessoa.findMany({
    where: {
      status: "ativo",
      teamRole: { in: ["admin", "lideranca"] },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: {
      id: true,
      nomeCompleto: true,
      apelido: true,
      cargoFamilia: true,
    },
    orderBy: { nomeCompleto: "asc" },
  });
}

/** Estatísticas para o painel de /time. */
export async function getTimeStats() {
  const [ativos, arquivados, porFilial, porDepartamento] = await Promise.all([
    prisma.pessoa.count({ where: { status: "ativo" } }),
    prisma.pessoa.count({ where: { status: "arquivado" } }),
    prisma.pessoa.groupBy({
      by: ["filialId"],
      where: { status: "ativo" },
      _count: { _all: true },
    }),
    prisma.pessoa.groupBy({
      by: ["departamentoId"],
      where: { status: "ativo" },
      _count: { _all: true },
    }),
  ]);
  return { ativos, arquivados, porFilial, porDepartamento };
}

/* ──────────────────────────────────────────────────────────────────────────
   UTILS
   ────────────────────────────────────────────────────────────────────────── */

export function pessoaIniciais(nomeCompleto: string): string {
  const parts = nomeCompleto.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function formatCpf(cpf: string): string {
  const digits = cpf.replace(/\D/g, "");
  if (digits.length !== 11) return cpf;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}
