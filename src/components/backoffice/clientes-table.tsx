"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Users,
  Search,
  Edit2,
  Check,
  X,
  Loader2,
  Upload,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  AlertTriangle,
  HelpCircle,
  Download,
  CalendarClock,
  CalendarCheck,
  Wallet,
  TrendingUp,
  UserCircle,
  Filter,
  ChevronDown,
  MessageCircle,
  CalendarPlus,
  Phone,
} from "lucide-react";
import { statusTermometro } from "@/lib/cadencia-core";
import {
  selarPresenca,
  type SeloPresenca,
} from "@/lib/painel-atencao/selo-presenca";
import type { EstadoAtencao } from "@/lib/painel-atencao/core";
import { getNomeRelacionamento } from "@/lib/backoffice/display-name";
import { ApelidoEditButton } from "@/components/backoffice/apelido-edit-button";

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    XLSX: any;
  }
}

const HEADER_MAP: Record<string, string> = {
  // Identidade
  nome: "nome",
  name: "nome",
  cliente: "nome",
  numeroconta: "numeroConta",
  numerodaconta: "numeroConta",
  numero_conta: "numeroConta",
  conta: "numeroConta",
  account: "numeroConta",
  nconta: "numeroConta",
  cpf: "cpfCnpj",
  cnpj: "cpfCnpj",
  cpfcnpj: "cpfCnpj",
  numerodocumento: "cpfCnpj",
  ndocumento: "cpfCnpj",
  numdocumento: "cpfCnpj",

  // AUM / saldo
  saldo: "saldo",
  aum: "saldo",
  patrimonio: "saldo",
  balance: "saldo",
  pltotal: "saldo",
  pl: "saldo",
  saldoconta: "saldoConta",
  saldocontacorrente: "saldoConta",
  saldocc: "saldoConta",
  cash: "saldoConta",
  contacorrente: "saldoConta",

  // Contato
  email: "email",
  emailprincipal: "email",
  emailcomunicacao: "email",
  emailacesso: "email",
  telefone: "telefone",
  celular: "telefone",
  fone: "telefone",
  whatsapp: "telefone",

  // Cadastrais
  profissao: "profissao",
  profession: "profissao",
  ocupacao: "profissao",
  profissaosetor: "profissao",
  setor: "profissao",
  nicho: "nicho",
  segmento: "nicho",
  aniversario: "aniversario",
  dataaniversario: "aniversario",
  datanascimento: "aniversario",
  nascimento: "aniversario",
  estadocivil: "estadoCivil",
  genero: "genero",
  sexo: "genero",
  nacionalidade: "nacionalidade",
  cpfconjuge: "cpfConjuge",
  tipoconta: "tipoConta",
  tipo: "tipoConta",

  // Endereço
  endereco: "endereco",
  endereco1: "endereco",
  enderecoresidencial: "endereco",
  rua: "endereco",
  logradouro: "endereco",
  complemento: "complemento",
  cidade: "cidade",
  municipio: "cidade",
  estado: "estado",
  uf: "estado",
  cep: "cep",

  // Status conta + revisões cadastrais
  ativacaodeconta: "ativacaoConta",
  ativacaoconta: "ativacaoConta",
  statusconta: "ativacaoConta",
  pendenciacadastral: "pendenciaCadastral",
  dataultimarevisaocadastral: "dataUltimaRevisaoCadastral",
  ultimarevisaocadastral: "dataUltimaRevisaoCadastral",
  dataproximarevisaocadastral: "dataProximaRevisaoCadastral",
  proximarevisaocadastral: "dataProximaRevisaoCadastral",
  dataaberturadaconta: "dataAberturaConta",
  datadeaberturadaconta: "dataAberturaConta",
  dataaberturaconta: "dataAberturaConta",
  dataabertura: "dataAberturaConta",
  abertura: "dataAberturaConta",

  // Classificação
  classificacao: "classificacao",
  classe: "classificacao",
  abc: "classificacao",

  // Receita
  receita: "receitaAnual",
  receitaanual: "receitaAnual",
  receitaano: "receitaAnual",
  rendaanual: "receitaAnual",

  // Suitability
  perfilsuitability: "perfilInvestidor",
  perfilinvestidor: "perfilInvestidor",
  suitability: "perfilInvestidor",
  vencimentosuitability: "suitabilityValidoAte",
  validadesuitability: "suitabilityValidoAte",
  tipoinvestidor: "tipoInvestidor",
  faixacliente: "faixaCliente",
  faixaclient: "faixaCliente",

  // Assessor + escritório
  assessor: "assessorNome",
  assessornome: "assessorNome",
  codigoassessor: "assessorCge",
  codigodoassessor: "assessorCge",
  cgeassessor: "assessorCge",
  cge: "assessorCge",
  emailassessor: "assessorEmail",
  emaildoassessor: "assessorEmail",
  tipoparceiro: "tipoParceiro",
  escritorio: "escritorio",
  codigoescritorio: "codigoEscritorio",
  codigodoescritorio: "codigoEscritorio",
  idcliente: "idClienteBtg",
  idclientebtg: "idClienteBtg",

  // Detalhamento financeiro (vai pra breakdownProdutos JSON no server)
  fundos: "fundos",
  rendafixa: "rendaFixa",
  rendavariavel: "rendaVariavel",
  previdencia: "previdencia",
  derivativos: "derivativos",
  valoremtransito: "valorEmTransito",
  criptoativos: "criptoativos",
  qtdativos: "qtdAtivos",
  qtddeativos: "qtdAtivos",
  qtdfundos: "qtdFundos",
  qtdrendafixa: "qtdRendaFixa",
  qtdrendavariavel: "qtdRendaVariavel",
  qtdprevidencia: "qtdPrevidencia",
  qtdderivativos: "qtdDerivativos",
  qtdvaloremtransito: "qtdValorEmTransito",
  qtdcriptoativos: "qtdCriptoativos",
  qtdaportes: "qtdAportes",
  qtddeaportes: "qtdAportes",
  aportes: "aportes",
  retiradas: "retiradas",
  primeiroaporte: "primeiroAporte",
  "1aporte": "primeiroAporte",
  ultimoaporte: "ultimoAporte",
  pldeclarado: "plDeclarado",
  carteiraadministrada: "carteiraAdministrada",
  termodemarcacaonacurva: "termoMarcacaoNaCurva",
  termomarcacaonacurva: "termoMarcacaoNaCurva",
};

function normHeader(h: string): string {
  return String(h)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function isVazio(v: unknown): boolean {
  return v === undefined || v === null || (typeof v === "string" && v.trim() === "");
}

function mapRowToCliente(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    const target = HEADER_MAP[normHeader(k)];
    if (!target) continue;
    if (isVazio(v)) continue;
    if (isVazio(out[target])) out[target] = v;
  }
  return out;
}

interface Cliente {
  id: string;
  nome: string;
  nomeCompleto: string | null;
  apelido: string | null;
  numeroConta: string;
  saldo: number;
  saldoConta: number;
  classificacao: string;
  classificacaoManual: boolean;
  email: string | null;
  telefone: string | null;
  profissao: string | null;
  nicho: string | null;
  ultimoContatoAt: Date | string | null;
  ultimaReuniaoAt: Date | string | null;
  proximaReuniaoAt: Date | string | null;
  proximoContatoAt: Date | string | null;
  receitaAnual: number;
  assessorNome: string | null;
  assessorCge: string | null;
  assessorEmail: string | null;
  pendenciaCadastral: string | null;
  aniversario: Date | string | null;
  // Fusão inline de atenção (flag CLIENTES_ATENCAO_INLINE). OPCIONAIS: só vêm
  // preenchidos com a flag ON; ausentes (undefined) → coluna Presença idêntica.
  ultimaMensagemMinhaEm?: Date | string | null;
  ultimaMensagemClienteEm?: Date | string | null;
  estado?: EstadoAtencao;
}

type FaixaSaldo = "todos" | "0-10k" | "10k-50k" | "50k-100k" | "100k-500k" | "500k+";
type SortKey =
  | "nome"
  | "saldo"
  | "saldoConta"
  | "receitaAnual"
  | "ultimoContatoAt"
  | "ultimaReuniaoAt"
  | "proximaReuniaoAt"
  | "classificacao"
  | "assessorNome";
type SortDir = "asc" | "desc";

const FAIXAS_SALDO: { valor: FaixaSaldo; label: string; min: number; max: number }[] = [
  { valor: "todos", label: "Todos os saldos", min: 0, max: Infinity },
  { valor: "0-10k", label: "Até R$ 10 mil", min: 0, max: 10_000 },
  { valor: "10k-50k", label: "R$ 10k – 50k", min: 10_000, max: 50_000 },
  { valor: "50k-100k", label: "R$ 50k – 100k", min: 50_000, max: 100_000 },
  { valor: "100k-500k", label: "R$ 100k – 500k", min: 100_000, max: 500_000 },
  { valor: "500k+", label: "Acima de R$ 500k", min: 500_000, max: Infinity },
];

const classCores: Record<string, string> = {
  A: "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-900/30 dark:text-amber-200",
  B: "bg-blue-100 text-blue-900 border-blue-300 dark:bg-blue-900/30 dark:text-blue-200",
  C: "bg-zinc-100 text-zinc-700 border-zinc-300 dark:bg-zinc-900/50 dark:text-zinc-300",
};

const classLegenda: Record<string, string> = {
  A: "Top clientes · 12-4-2",
  B: "Relacionamento ativo",
  C: "Manutenção",
};

// Termômetro de presença — cores vivas por status. A régua de cadência
// (A=30/B=90/C=180) e o cálculo verde/amarelo/vermelho vivem em cadencia-core.ts.
const SELO_TERMOMETRO: Record<SeloPresenca, { dot: string; texto: string; label: string }> = {
  verde: { dot: "bg-emerald-500", texto: "text-emerald-700 dark:text-emerald-400", label: "Em dia" },
  amarelo: { dot: "bg-amber-400", texto: "text-amber-700 dark:text-amber-400", label: "Atenção" },
  vermelho: { dot: "bg-red-500", texto: "text-red-700 dark:text-red-400", label: "Atrasado" },
  // Família vermelha, tom distinto (red-600) p/ diferenciar de "Atrasado" (red-500):
  // nós falamos e o cliente não respondeu dentro da cadência → bola em campo dele.
  "no-vacuo": { dot: "bg-red-600", texto: "text-red-700 dark:text-red-400", label: "No-vácuo" },
  "sem-historico": { dot: "bg-zinc-300 dark:bg-zinc-600", texto: "text-muted-foreground", label: "Sem histórico" },
};

const SALDO_PARADO_LIMITE = 50_000;

export function ClientesTable({
  clientes: iniciais,
  isAdmin = false,
}: {
  clientes: Cliente[];
  isAdmin?: boolean;
}) {
  const [clientes, setClientes] = useState(iniciais);

  // Filtros
  const [busca, setBusca] = useState("");
  const [filtroClasse, setFiltroClasse] = useState<"todos" | "A" | "B" | "C">("todos");
  const [filtroSaldoConta, setFiltroSaldoConta] = useState<FaixaSaldo>("todos");
  const [filtroAssessor, setFiltroAssessor] = useState<string>("todos");
  const [foraCadencia, setForaCadencia] = useState(false);
  const [semProximaReuniao, setSemProximaReuniao] = useState(false);
  const [saldoParado, setSaldoParado] = useState(false);
  const [filtrosExpandidos, setFiltrosExpandidos] = useState(false);

  // Ordenação
  const [sortKey, setSortKey] = useState<SortKey>("saldo");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Seleção múltipla
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());

  // Estados existentes
  const [editando, setEditando] = useState<string | null>(null);
  const [importando, setImportando] = useState(false);
  const [importStatus, setImportStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [xlsxReady, setXlsxReady] = useState(false);
  const [marcandoContato, setMarcandoContato] = useState(false);
  const [registrandoReuniao, setRegistrandoReuniao] = useState<string | null>(null);
  const [registrandoContato, setRegistrandoContato] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isAdmin) return;
    if (typeof window === "undefined") return;
    if (window.XLSX) {
      setXlsxReady(true);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js";
    script.onload = () => setXlsxReady(true);
    document.head.appendChild(script);
  }, [isAdmin]);

  // ─── Helpers ───────────────────────────────────────────────────────────

  const moeda = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  const diasDesde = (data: Date | string | null): number | null => {
    if (!data) return null;
    return Math.floor((Date.now() - new Date(data).getTime()) / (1000 * 60 * 60 * 24));
  };

  const diasAte = (data: Date | string | null): number | null => {
    if (!data) return null;
    return Math.ceil((new Date(data).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  };

  const formatData = (data: Date | string | null): string => {
    if (!data) return "—";
    return new Date(data).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
  };

  // Status legado de 3 estados (ok/atencao/alerta) usado por filtros e contadores.
  // Deriva do termômetro compartilhado: vermelho→alerta, amarelo→atencao,
  // verde/sem-historico→ok (nunca-contatado é estado neutro, não conta como fora).
  const statusCadencia = (c: Cliente): "ok" | "atencao" | "alerta" => {
    const { status } = statusTermometro(c.classificacao, c.ultimoContatoAt);
    if (status === "vermelho") return "alerta";
    if (status === "amarelo") return "atencao";
    return "ok";
  };

  const whatsappLink = (telefone: string | null): string | null => {
    if (!telefone) return null;
    const limpo = telefone.replace(/\D/g, "");
    if (limpo.length < 10) return null;
    const comDdi = limpo.startsWith("55") ? limpo : `55${limpo}`;
    return `https://wa.me/${comDdi}`;
  };

  // Lista única de assessores presentes nos clientes
  const assessoresDisponiveis = useMemo(() => {
    const set = new Set<string>();
    for (const c of clientes) {
      if (c.assessorNome) set.add(c.assessorNome);
    }
    return Array.from(set).sort();
  }, [clientes]);

  // Filtragem
  const filtrados = useMemo(() => {
    return clientes.filter((c) => {
      if (filtroClasse !== "todos" && c.classificacao !== filtroClasse) return false;
      if (busca) {
        const b = busca.toLowerCase();
        const hit =
          c.nome.toLowerCase().includes(b) ||
          c.numeroConta.includes(busca) ||
          (c.assessorNome || "").toLowerCase().includes(b);
        if (!hit) return false;
      }
      if (filtroSaldoConta !== "todos") {
        const faixa = FAIXAS_SALDO.find((f) => f.valor === filtroSaldoConta);
        if (faixa && (c.saldoConta < faixa.min || c.saldoConta >= faixa.max)) return false;
      }
      if (filtroAssessor === "sem_assessor" && c.assessorNome) return false;
      if (filtroAssessor !== "todos" && filtroAssessor !== "sem_assessor" && c.assessorNome !== filtroAssessor)
        return false;
      if (foraCadencia && statusCadencia(c) === "ok") return false;
      if (semProximaReuniao && c.proximaReuniaoAt) return false;
      if (saldoParado && c.saldoConta < SALDO_PARADO_LIMITE) return false;
      return true;
    });
  }, [clientes, busca, filtroClasse, filtroSaldoConta, filtroAssessor, foraCadencia, semProximaReuniao, saldoParado]);

  // Ordenação
  const ordenados = useMemo(() => {
    const arr = [...filtrados];
    const dir = sortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      const va = a[sortKey];
      const vb = b[sortKey];
      if (va === null || va === undefined) return 1;
      if (vb === null || vb === undefined) return -1;
      if (typeof va === "string" && typeof vb === "string") {
        return va.localeCompare(vb) * dir;
      }
      if (va instanceof Date || (typeof va === "string" && !isNaN(Date.parse(va as string)))) {
        return (new Date(va as string).getTime() - new Date(vb as string).getTime()) * dir;
      }
      return ((va as number) - (vb as number)) * dir;
    });
    return arr;
  }, [filtrados, sortKey, sortDir]);

  // KPIs do topo — usam `filtrados` para respeitarem o filtro de assessor/cadência/etc.
  const kpis = useMemo(() => {
    const totalA = filtrados.filter((c) => c.classificacao === "A").length;
    const aForaCadencia = filtrados.filter(
      (c) => c.classificacao === "A" && statusCadencia(c) !== "ok"
    ).length;
    const pctAOk = totalA > 0 ? Math.round(((totalA - aForaCadencia) / totalA) * 100) : 100;

    const proximaSemana = new Date();
    proximaSemana.setDate(proximaSemana.getDate() + 7);
    const reunioesSemana = filtrados.filter((c) => {
      if (!c.proximaReuniaoAt) return false;
      const d = new Date(c.proximaReuniaoAt);
      return d.getTime() >= Date.now() && d <= proximaSemana;
    }).length;

    const plTotal = filtrados.reduce((sum, c) => sum + c.saldo, 0);

    const saldoParadoTotal = filtrados
      .filter((c) => c.saldoConta >= SALDO_PARADO_LIMITE)
      .reduce((sum, c) => sum + c.saldoConta, 0);

    const saldoNegativoTotal = filtrados
      .filter((c) => c.saldoConta < 0)
      .reduce((sum, c) => sum + c.saldoConta, 0);
    const clientesNegativos = filtrados.filter((c) => c.saldoConta < 0).length;

    const rendaTotal = filtrados.reduce((sum, c) => sum + c.receitaAnual, 0);

    const pendencias = filtrados.filter(
      (c) => c.pendenciaCadastral && c.pendenciaCadastral.trim() !== ""
    ).length;

    const hoje = new Date();
    const seteDias = new Date(hoje.getTime() + 7 * 24 * 60 * 60 * 1000);
    const aniversariantes = filtrados.filter((c) => {
      if (!c.aniversario) return false;
      const aniv = new Date(c.aniversario);
      // compara MM-DD ignorando o ano
      const hojeMD = hoje.getMonth() * 100 + hoje.getDate();
      const fimMD = seteDias.getMonth() * 100 + seteDias.getDate();
      const anivMD = aniv.getMonth() * 100 + aniv.getDate();
      if (fimMD >= hojeMD) return anivMD >= hojeMD && anivMD <= fimMD;
      // janela cruza virada de ano (dez→jan)
      return anivMD >= hojeMD || anivMD <= fimMD;
    }).length;

    return {
      pctAOk,
      totalA,
      aForaCadencia,
      reunioesSemana,
      plTotal,
      saldoParadoTotal,
      saldoNegativoTotal,
      clientesNegativos,
      rendaTotal,
      pendencias,
      aniversariantes,
    };
  }, [filtrados]);

  const contadores = {
    A: clientes.filter((c) => c.classificacao === "A").length,
    B: clientes.filter((c) => c.classificacao === "B").length,
    C: clientes.filter((c) => c.classificacao === "C").length,
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir(key === "nome" || key === "assessorNome" ? "asc" : "desc");
    }
  };

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) return <ArrowUpDown className="h-3 w-3 opacity-40" />;
    return sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
  };

  // ─── Operações ──────────────────────────────────────────────────────────

  const importarArquivos = async (files: FileList | File[]) => {
    if (importando) return;
    const lista = Array.from(files);
    if (lista.length === 0) return;
    if (!xlsxReady || !window.XLSX) {
      setImportStatus({ ok: false, msg: "Biblioteca de leitura ainda carregando, tente em 1s." });
      return;
    }
    for (const f of lista) {
      const ext = f.name.substring(f.name.lastIndexOf(".")).toLowerCase();
      if (![".xlsx", ".xls", ".csv"].includes(ext)) {
        setImportStatus({ ok: false, msg: `Formato inválido em "${f.name}". Use .xlsx, .xls ou .csv.` });
        return;
      }
    }
    setImportando(true);
    setImportStatus({ ok: true, msg: `Lendo ${lista.length} arquivo(s)...` });
    try {
      const merged: Record<string, Record<string, unknown>> = {};
      let totalLinhas = 0;

      for (const f of lista) {
        const buffer = await f.arrayBuffer();
        const workbook = window.XLSX.read(buffer, { type: "array", cellDates: true });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows: Record<string, unknown>[] = window.XLSX.utils.sheet_to_json(sheet, { defval: "" });
        for (const row of rows) {
          const mapped = mapRowToCliente(row);
          const conta = String(mapped.numeroConta ?? "").trim();
          const nome = String(mapped.nome ?? "").trim();
          if (!conta && !nome) continue;
          const chave = conta || `nome:${nome.toLowerCase()}`;
          const acc = merged[chave] || {};
          for (const [k, v] of Object.entries(mapped)) {
            if (v === undefined || v === null || v === "") continue;
            if (acc[k] === undefined || acc[k] === null || acc[k] === "") acc[k] = v;
          }
          merged[chave] = acc;
          totalLinhas++;
        }
      }

      const parsed = Object.values(merged).filter(
        (c) => String(c.nome ?? "").trim().length > 0 || String(c.numeroConta ?? "").trim().length > 0,
      );
      if (parsed.length === 0) {
        setImportStatus({ ok: false, msg: "Nenhuma linha válida. A planilha precisa ter coluna 'Conta' ou 'Nome'." });
        return;
      }

      const CHUNK = 500;
      const total = parsed.length;
      let criados = 0;
      let atualizados = 0;
      let orfaos = 0;
      let pareados = 0;
      let rotuloModo = "";
      const erros: string[] = [];

      for (let i = 0; i < total; i += CHUNK) {
        const slice = parsed.slice(i, i + CHUNK);
        const fim = Math.min(i + CHUNK, total);
        setImportStatus({
          ok: true,
          msg: `Enviando ${fim}/${total} clientes (${lista.length} arquivo(s), ${totalLinhas} linhas)...`,
        });
        try {
          const res = await fetch("/api/backoffice/clientes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ clientes: slice }),
          });
          const data = await res.json();
          if (!res.ok) {
            erros.push(`Batch ${i + 1}-${fim}: ${data.error || res.status}`);
            continue;
          }
          criados += data.criados || 0;
          atualizados += data.atualizados || 0;
          orfaos += data.orfaos || 0;
          pareados += data.duplicadosResolvidos || 0;
          if (data.rotuloModo) rotuloModo = data.rotuloModo;
        } catch (e) {
          erros.push(`Batch ${i + 1}-${fim}: ${e instanceof Error ? e.message : "erro de rede"}`);
        }
      }

      const partes: string[] = [];
      if (rotuloModo) partes.push(`Relatório: ${rotuloModo}`);
      partes.push(`${criados} novos`, `${atualizados} atualizados`);
      if (orfaos > 0) partes.push(`${orfaos} órfãos (sem match)`);
      if (pareados > 0) partes.push(`${pareados} pareados por CPF/nome`);
      if (erros.length > 0) partes.push(`${erros.length} batch(es) com erro`);
      setImportStatus({
        ok: erros.length === 0,
        msg: `${partes.join(" · ")}${erros.length > 0 ? " — " + erros.slice(0, 2).join("; ") : ""}`,
      });
      if (erros.length === 0) setTimeout(() => window.location.reload(), 1800);
    } catch (e) {
      setImportStatus({ ok: false, msg: e instanceof Error ? e.message : "Erro ao processar arquivos." });
    } finally {
      setImportando(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const atualizarClasse = async (id: string, novaClasse: string) => {
    const res = await fetch(`/api/backoffice/clientes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ classificacao: novaClasse, classificacaoManual: true }),
    });
    if (res.ok) {
      setClientes((prev) =>
        prev.map((c) => (c.id === id ? { ...c, classificacao: novaClasse, classificacaoManual: true } : c))
      );
      setEditando(null);
    }
  };

  const toggleSelecionado = (id: string) => {
    setSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selecionarTodos = () => {
    if (selecionados.size === ordenados.length) {
      setSelecionados(new Set());
    } else {
      setSelecionados(new Set(ordenados.map((c) => c.id)));
    }
  };

  const limparFiltros = () => {
    setFiltroClasse("todos");
    setFiltroSaldoConta("todos");
    setFiltroAssessor("todos");
    setForaCadencia(false);
    setSemProximaReuniao(false);
    setSaldoParado(false);
    setBusca("");
  };

  const filtrosAtivos =
    filtroClasse !== "todos" ||
    filtroSaldoConta !== "todos" ||
    filtroAssessor !== "todos" ||
    foraCadencia ||
    semProximaReuniao ||
    saldoParado ||
    !!busca;

  const exportarCSV = () => {
    const alvo = selecionados.size > 0 ? ordenados.filter((c) => selecionados.has(c.id)) : ordenados;
    const cabecalhos = [
      "Classe",
      "Nome",
      "Conta",
      "AUM",
      "Saldo Conta",
      "Receita/ano",
      "Assessor",
      "Telefone",
      "Email",
      "Último contato",
      "Última reunião",
      "Próxima reunião",
    ];
    const linhas = alvo.map((c) => [
      c.classificacao,
      c.nome,
      c.numeroConta,
      c.saldo.toFixed(2).replace(".", ","),
      c.saldoConta.toFixed(2).replace(".", ","),
      c.receitaAnual.toFixed(2).replace(".", ","),
      c.assessorNome || "",
      c.telefone || "",
      c.email || "",
      c.ultimoContatoAt ? new Date(c.ultimoContatoAt).toLocaleDateString("pt-BR") : "",
      c.ultimaReuniaoAt ? new Date(c.ultimaReuniaoAt).toLocaleDateString("pt-BR") : "",
      c.proximaReuniaoAt ? new Date(c.proximaReuniaoAt).toLocaleDateString("pt-BR") : "",
    ]);
    const csv = [cabecalhos, ...linhas]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(";"))
      .join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `clientes_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const registrarReuniaoAgora = async (id: string, nome: string) => {
    if (!confirm(`Registrar reunião realizada agora com ${nome}?`)) return;
    setRegistrandoReuniao(id);
    try {
      const res = await fetch(`/api/backoffice/clientes/${id}/interacoes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo: "reuniao",
          canal: "presencial",
          assunto: "Reunião realizada",
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const interacao = await res.json();
      const agora = interacao.data ?? new Date().toISOString();
      setClientes((prev) =>
        prev.map((c) =>
          c.id === id ? { ...c, ultimaReuniaoAt: agora, ultimoContatoAt: agora } : c,
        ),
      );
    } catch (e) {
      console.error("Erro ao registrar reunião:", e);
      alert("Não foi possível registrar a reunião. Tente novamente.");
    } finally {
      setRegistrandoReuniao(null);
    }
  };

  const registrarContatoAgora = async (id: string, nome: string) => {
    if (!confirm(`Registrar contato realizado agora com ${nome}?`)) return;
    setRegistrandoContato(id);
    try {
      const res = await fetch(`/api/backoffice/clientes/${id}/interacoes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo: "ligacao",
          canal: "telefone",
          assunto: "Contato registrado",
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const interacao = await res.json();
      const agora = interacao.data ?? new Date().toISOString();
      // Atualiza ultimoContatoAt local → o selo do termômetro recalcula na hora.
      // proximoContatoAt é recalculado no servidor (interacoes POST).
      setClientes((prev) =>
        prev.map((c) => (c.id === id ? { ...c, ultimoContatoAt: agora } : c)),
      );
    } catch (e) {
      console.error("Erro ao registrar contato:", e);
      alert("Não foi possível registrar o contato. Tente novamente.");
    } finally {
      setRegistrandoContato(null);
    }
  };

  const marcarContatadosHoje = async () => {
    if (selecionados.size === 0) return;
    if (!confirm(`Marcar ${selecionados.size} cliente(s) como contatado(s) hoje?`)) return;
    setMarcandoContato(true);
    const hoje = new Date().toISOString();
    try {
      const ids = Array.from(selecionados);
      await Promise.all(
        ids.map((id) =>
          fetch(`/api/backoffice/clientes/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ultimoContatoAt: hoje }),
          })
        )
      );
      setClientes((prev) =>
        prev.map((c) => (selecionados.has(c.id) ? { ...c, ultimoContatoAt: hoje } : c))
      );
      setSelecionados(new Set());
    } catch (e) {
      console.error("Erro ao marcar contatos:", e);
    } finally {
      setMarcandoContato(false);
    }
  };

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Painel de saúde — 8 KPIs (todos respeitam filtros ativos) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* Linha 1 — financeiros */}
        <KpiCard
          icon={TrendingUp}
          label="Patrimônio líquido total"
          value={moeda(kpis.plTotal)}
          sub={`${filtrados.length} clientes ${filtrados.length !== clientes.length ? "(filtrados)" : ""}`}
          tone="neutro"
        />
        <KpiCard
          icon={Wallet}
          label="Saldo parado em conta"
          value={moeda(kpis.saldoParadoTotal)}
          sub={`clientes com > ${moeda(SALDO_PARADO_LIMITE)}`}
          tone={kpis.saldoParadoTotal > 0 ? "atencao" : "neutro"}
        />
        <KpiCard
          icon={AlertTriangle}
          label="Saldo negativo"
          value={moeda(kpis.saldoNegativoTotal)}
          sub={kpis.clientesNegativos === 0 ? "nenhum cliente em margem" : `${kpis.clientesNegativos} cliente(s) em margem`}
          tone={kpis.saldoNegativoTotal < 0 ? "alerta" : "neutro"}
        />
        <KpiCard
          icon={TrendingUp}
          label="Renda anual dos clientes"
          value={moeda(kpis.rendaTotal)}
          sub="somatório de Renda Anual (BTG)"
          tone="neutro"
        />
        {/* Linha 2 — operacionais */}
        <KpiCard
          icon={TrendingUp}
          label="Clientes A na cadência"
          value={`${kpis.pctAOk}%`}
          sub={`${kpis.totalA - kpis.aForaCadencia}/${kpis.totalA} dentro do 12-4-2`}
          tone={kpis.pctAOk >= 80 ? "ok" : kpis.pctAOk >= 60 ? "atencao" : "alerta"}
        />
        <KpiCard
          icon={CalendarCheck}
          label="Reuniões próx. 7 dias"
          value={String(kpis.reunioesSemana)}
          sub="agendadas no calendar"
          tone="neutro"
        />
        <KpiCard
          icon={AlertTriangle}
          label="Pendências cadastrais"
          value={String(kpis.pendencias)}
          sub={kpis.pendencias === 0 ? "sem pendências" : "abrir BTG p/ resolver"}
          tone={kpis.pendencias > 0 ? "atencao" : "ok"}
        />
        <KpiCard
          icon={CalendarCheck}
          label="Aniversariantes (7 dias)"
          value={String(kpis.aniversariantes)}
          sub="oportunidade de contato"
          tone={kpis.aniversariantes > 0 ? "ok" : "neutro"}
        />
      </div>

      {/* Contadores por classe — clicáveis para filtrar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {(["A", "B", "C"] as const).map((classe) => (
          <button
            key={classe}
            onClick={() => setFiltroClasse(filtroClasse === classe ? "todos" : classe)}
            className={`rounded-xl border p-4 text-left transition-all ${
              filtroClasse === classe ? "ring-2 ring-primary" : ""
            } ${classCores[classe]}`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-3xl font-bold">{classe}</span>
              <span className="text-2xl font-semibold">{contadores[classe]}</span>
            </div>
            <p className="text-xs font-medium flex items-center gap-1">
              {classLegenda[classe]}
              {classe === "A" && (
                <span
                  title="Cadência mínima para clientes A: 12 contatos, 4 reuniões e 2 revisões por ano (modelo Supernova). ~ 1 contato a cada 30 dias."
                  className="cursor-help"
                >
                  <HelpCircle className="h-3 w-3 opacity-60" />
                </span>
              )}
            </p>
          </button>
        ))}
      </div>

      {/* Linha de busca + ações */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, conta ou assessor..."
            className="w-full pl-10 pr-4 py-2 rounded-lg border bg-background text-sm"
          />
        </div>

        <button
          onClick={() => setFiltrosExpandidos(!filtrosExpandidos)}
          className={`px-3 py-2 rounded-lg border text-sm flex items-center gap-2 ${
            filtrosAtivos ? "bg-primary/10 border-primary/40" : ""
          }`}
        >
          <Filter className="h-4 w-4" />
          Filtros {filtrosAtivos && <span className="text-xs">●</span>}
          <ChevronDown className={`h-3 w-3 transition-transform ${filtrosExpandidos ? "rotate-180" : ""}`} />
        </button>

        <button
          onClick={exportarCSV}
          className="px-3 py-2 rounded-lg border text-sm flex items-center gap-2"
          title="Exportar para CSV (abre no Excel)"
        >
          <Download className="h-4 w-4" />
          Exportar CSV {selecionados.size > 0 && `(${selecionados.size})`}
        </button>

        {isAdmin && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              multiple
              onChange={(e) => {
                const files = e.target.files;
                if (files && files.length > 0) importarArquivos(files);
              }}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={importando || !xlsxReady}
              className="px-3 py-2 rounded-lg border border-primary/40 bg-primary/10 text-primary text-sm flex items-center gap-2 hover:bg-primary/20 disabled:opacity-50"
              title="Importar 1 ou 2 planilhas (.xlsx/.csv) — Cadastrais e/ou Base BTG. Atualiza existentes por Conta/CPF/Nome, cadastra novos."
            >
              {importando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {importando ? "Importando..." : "Importar dados"}
            </button>
          </>
        )}
      </div>

      {/* Filtros avançados expansíveis */}
      {filtrosExpandidos && (
        <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Faixa de saldo em conta</label>
              <select
                value={filtroSaldoConta}
                onChange={(e) => setFiltroSaldoConta(e.target.value as FaixaSaldo)}
                className="w-full px-3 py-2 rounded-lg border bg-background text-sm"
              >
                {FAIXAS_SALDO.map((f) => (
                  <option key={f.valor} value={f.valor}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Assessor ({assessoresDisponiveis.length})
              </label>
              <select
                value={filtroAssessor}
                onChange={(e) => setFiltroAssessor(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border bg-background text-sm"
              >
                <option value="todos">Todos os assessores</option>
                <option value="sem_assessor">Sem assessor atribuído</option>
                {assessoresDisponiveis.map((nome) => (
                  <option key={nome} value={nome}>
                    {nome}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={foraCadencia}
                onChange={(e) => setForaCadencia(e.target.checked)}
                className="rounded"
              />
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              Fora da cadência 12-4-2
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={semProximaReuniao}
                onChange={(e) => setSemProximaReuniao(e.target.checked)}
                className="rounded"
              />
              <CalendarClock className="h-4 w-4 text-blue-600" />
              Sem próxima reunião agendada
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={saldoParado}
                onChange={(e) => setSaldoParado(e.target.checked)}
                className="rounded"
              />
              <Wallet className="h-4 w-4 text-amber-600" />
              Saldo parado &gt; {moeda(SALDO_PARADO_LIMITE)}
            </label>

            {filtrosAtivos && (
              <button
                onClick={limparFiltros}
                className="ml-auto px-3 py-1 text-xs rounded border flex items-center gap-1"
              >
                Limpar tudo <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
      )}

      {importStatus && (
        <div
          className={`px-4 py-3 rounded-lg text-sm border ${
            importStatus.ok
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400"
              : "bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-400"
          }`}
        >
          {importStatus.msg}
        </div>
      )}

      {/* Barra de ações em massa */}
      {selecionados.size > 0 && (
        <div className="rounded-lg border bg-primary/5 border-primary/30 px-4 py-3 flex items-center gap-3 text-sm">
          <span className="font-medium">{selecionados.size} selecionado(s)</span>
          <button
            onClick={marcarContatadosHoje}
            disabled={marcandoContato}
            className="px-3 py-1.5 rounded-md bg-emerald-600 text-white text-xs flex items-center gap-1 hover:bg-emerald-700 disabled:opacity-50"
          >
            {marcandoContato ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
            Marcar contatados hoje
          </button>
          <button
            onClick={exportarCSV}
            className="px-3 py-1.5 rounded-md border text-xs flex items-center gap-1"
          >
            <Download className="h-3 w-3" />
            Exportar selecionados
          </button>
          <button onClick={() => setSelecionados(new Set())} className="ml-auto text-xs underline">
            Limpar seleção
          </button>
        </div>
      )}

      {/* Tabela */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex items-center gap-3">
          <Users className="h-5 w-5 text-muted-foreground" />
          <h3 className="font-semibold">
            Clientes — exibindo {ordenados.length}
            {ordenados.length !== clientes.length && ` de ${clientes.length}`}
          </h3>
          <span className="ml-auto text-xs text-muted-foreground">
            Ordenado por <strong>{sortKey}</strong> ({sortDir === "asc" ? "crescente" : "decrescente"})
          </span>
        </div>
        <div className="overflow-x-auto max-h-[640px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 sticky top-0 z-10">
              <tr>
                <th className="text-left px-3 py-3 w-8">
                  <input
                    type="checkbox"
                    checked={selecionados.size === ordenados.length && ordenados.length > 0}
                    onChange={selecionarTodos}
                    className="rounded"
                  />
                </th>
                <Th onClick={() => toggleSort("classificacao")}>
                  Classe <SortIcon k="classificacao" />
                </Th>
                <Th onClick={() => toggleSort("nome")}>
                  Nome <SortIcon k="nome" />
                </Th>
                <th className="text-left px-3 py-3 font-medium text-muted-foreground">Conta</th>
                <Th onClick={() => toggleSort("assessorNome")}>
                  Assessor <SortIcon k="assessorNome" />
                </Th>
                <Th align="right" onClick={() => toggleSort("saldo")}>
                  AUM <SortIcon k="saldo" />
                </Th>
                <Th align="right" onClick={() => toggleSort("saldoConta")}>
                  Saldo Conta <SortIcon k="saldoConta" />
                </Th>
                <Th align="right" onClick={() => toggleSort("receitaAnual")}>
                  Receita/ano <SortIcon k="receitaAnual" />
                </Th>
                <Th onClick={() => toggleSort("ultimoContatoAt")}>
                  Último contato <SortIcon k="ultimoContatoAt" />
                </Th>
                <th className="text-left px-3 py-3 font-medium text-muted-foreground">
                  <span title="Termômetro de presença: dias desde o último contato vs a cadência da classe (A=30, B=90, C=180 dias). Verde até 80%, amarelo 80-100%, vermelho acima.">
                    Presença
                  </span>
                </th>
                <Th onClick={() => toggleSort("ultimaReuniaoAt")}>
                  Última reunião <SortIcon k="ultimaReuniaoAt" />
                </Th>
                <Th onClick={() => toggleSort("proximaReuniaoAt")}>
                  Próxima reunião <SortIcon k="proximaReuniaoAt" />
                </Th>
                <th className="text-left px-3 py-3 font-medium text-muted-foreground whitespace-nowrap">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {ordenados.map((c) => {
                const cadencia = statusCadencia(c);
                // `term` é mantido: ainda alimenta o tooltip de recência (dias/cadência/%).
                const term = statusTermometro(c.classificacao, c.ultimoContatoAt);
                // Funde a recência com o sinal direcional `c.estado`. Flag OFF →
                // c.estado === undefined → selarPresenca devolve term.status (invariante)
                // → selo e tooltip byte-idênticos ao de hoje.
                const selo = selarPresenca(term.status, c.estado);
                const seloVisual = SELO_TERMOMETRO[selo];
                // Aceso por mensagens? (recência sem histórico, mas estado direcional acendeu)
                const seloViaMensagens =
                  term.status === "sem-historico" &&
                  (selo === "verde" || selo === "amarelo");
                const tituloPresenca =
                  selo === "no-vacuo"
                    ? `Você falou em ${formatData(c.ultimaMensagemMinhaEm ?? null)} · cliente sem resposta há ${diasDesde(c.ultimaMensagemMinhaEm ?? null) ?? "—"}d`
                    : (term.status === "sem-historico"
                        ? "Nenhum contato registrado"
                        : `${term.dias}d desde o último contato · cadência classe ${c.classificacao}: ${term.cadencia}d (${Math.round((term.pct ?? 0) * 100)}%)`) +
                      (seloViaMensagens ? " (via mensagens)" : "");
                const waLink = whatsappLink(c.telefone);
                const diasContato = diasDesde(c.ultimoContatoAt);
                const diasProxReuniao = diasAte(c.proximaReuniaoAt);

                return (
                  <tr key={c.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={selecionados.has(c.id)}
                        onChange={() => toggleSelecionado(c.id)}
                        className="rounded"
                      />
                    </td>

                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1">
                        {editando === c.id ? (
                          <div className="flex items-center gap-1">
                            {(["A", "B", "C"] as const).map((cl) => (
                              <button
                                key={cl}
                                onClick={() => atualizarClasse(c.id, cl)}
                                className={`w-7 h-7 rounded text-xs font-bold ${classCores[cl]}`}
                              >
                                {cl}
                              </button>
                            ))}
                            <button onClick={() => setEditando(null)} className="ml-1 text-muted-foreground">
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setEditando(c.id)}
                            className={`inline-flex items-center gap-1 px-2 py-1 rounded border text-xs font-bold ${
                              classCores[c.classificacao]
                            }`}
                            title={
                              c.classificacaoManual
                                ? "Classificação travada (manual)"
                                : "Classificação automática — clique para alterar"
                            }
                          >
                            {c.classificacao}
                            {c.classificacaoManual ? (
                              <Check className="h-3 w-3" />
                            ) : (
                              <Edit2 className="h-3 w-3 opacity-50" />
                            )}
                          </button>
                        )}
                        {cadencia !== "ok" && c.classificacao === "A" && (
                          <span
                            title={`Cliente A fora da cadência 12-4-2 (último contato há ${
                              diasContato === null ? "—" : `${diasContato} dias`
                            }). Cadência A: 30 dias (amarelo ≥24d, vermelho >30d).`}
                          >
                            <AlertTriangle
                              className={`h-3.5 w-3.5 ${
                                cadencia === "alerta" ? "text-red-500" : "text-amber-500"
                              }`}
                            />
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="px-3 py-3 font-medium group">
                      {/* Linha principal: apelido > nome > nomeCompleto.
                          Hover na célula revela o lápis de edição. */}
                      <div className="flex items-center gap-1.5">
                        <Link
                          href={`/empresas/investimentos/clientes/${c.id}`}
                          className="hover:underline hover:text-primary"
                          title={[
                            getNomeRelacionamento(c),
                            c.apelido && c.nome && c.apelido !== c.nome ? `Nome: ${c.nome}` : null,
                            c.nomeCompleto && c.nomeCompleto !== getNomeRelacionamento(c) ? `Completo: ${c.nomeCompleto}` : null,
                            c.email ? `E-mail: ${c.email}` : null,
                            c.telefone ? `Tel: ${c.telefone}` : null,
                            c.profissao ? `Profissão: ${c.profissao}` : null,
                            c.nicho ? `Nicho: ${c.nicho}` : null,
                            c.assessorNome ? `Assessor: ${c.assessorNome}` : null,
                          ]
                            .filter(Boolean)
                            .join("\n")}
                        >
                          {getNomeRelacionamento(c)}
                        </Link>
                        <ApelidoEditButton
                          cliente={c}
                          onSave={(novoApelido) =>
                            setClientes((prev) => prev.map((x) => (x.id === c.id ? { ...x, apelido: novoApelido } : x)))
                          }
                        />
                      </div>
                      {/* Subtítulo: nome formal quando o apelido difere */}
                      {c.apelido && c.nomeCompleto && c.apelido !== c.nomeCompleto && (
                        <div className="text-xs text-muted-foreground">{c.nomeCompleto}</div>
                      )}
                    </td>

                    <td className="px-3 py-3 text-muted-foreground font-mono text-xs">{c.numeroConta}</td>

                    <td className="px-3 py-3 text-xs">
                      {c.assessorNome ? (
                        <span
                          className="inline-flex items-center gap-1"
                          title={[c.assessorNome, c.assessorCge ? `CGE: ${c.assessorCge}` : null, c.assessorEmail].filter(Boolean).join("\n")}
                        >
                          <UserCircle className="h-3 w-3 opacity-60 flex-shrink-0" />
                          <span className="truncate max-w-[160px]">{c.assessorNome.split(" ")[0]}</span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground italic text-xs">sem assessor</span>
                      )}
                    </td>

                    <td className="px-3 py-3 text-right font-mono">{moeda(c.saldo)}</td>
                    <td className="px-3 py-3 text-right font-mono">
                      {c.saldoConta > 0 ? (
                        <span
                          className={
                            c.saldoConta >= SALDO_PARADO_LIMITE
                              ? "text-amber-700 dark:text-amber-400 font-semibold"
                              : "text-emerald-700 dark:text-emerald-400"
                          }
                          title={
                            c.saldoConta >= SALDO_PARADO_LIMITE
                              ? "Saldo elevado em conta — oportunidade de alocação"
                              : undefined
                          }
                        >
                          {moeda(c.saldoConta)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-muted-foreground">{moeda(c.receitaAnual)}</td>

                    <td className="px-3 py-3 text-xs">
                      {c.ultimoContatoAt ? (
                        <span
                          className={
                            cadencia === "alerta"
                              ? "text-red-600 dark:text-red-400"
                              : cadencia === "atencao"
                              ? "text-amber-600 dark:text-amber-400"
                              : "text-muted-foreground"
                          }
                          title={diasContato !== null ? `Há ${diasContato} dia(s)` : undefined}
                        >
                          {formatData(c.ultimoContatoAt)}
                          {diasContato !== null && diasContato > 0 && (
                            <span className="ml-1 opacity-60">({diasContato}d)</span>
                          )}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>

                    <td className="px-3 py-3">
                      <span
                        className="inline-flex items-center gap-1.5"
                        title={tituloPresenca}
                      >
                        <span className={`h-2.5 w-2.5 rounded-full ${seloVisual.dot}`} />
                        <span className={`text-xs ${seloVisual.texto}`}>{seloVisual.label}</span>
                      </span>
                    </td>

                    <td className="px-3 py-3 text-xs text-muted-foreground">
                      {c.ultimaReuniaoAt ? formatData(c.ultimaReuniaoAt) : "—"}
                    </td>

                    <td className="px-3 py-3 text-xs">
                      {c.proximaReuniaoAt ? (
                        <span
                          className={
                            diasProxReuniao !== null && diasProxReuniao <= 7
                              ? "text-blue-700 dark:text-blue-400 font-semibold"
                              : "text-emerald-700 dark:text-emerald-400"
                          }
                          title={diasProxReuniao !== null ? `Em ${diasProxReuniao} dia(s)` : undefined}
                        >
                          {formatData(c.proximaReuniaoAt)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>

                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1">
                        {waLink ? (
                          <a
                            href={waLink}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-green-500/10 text-green-700 dark:text-green-400 hover:bg-green-500/20 text-xs"
                            title={`Abrir WhatsApp com ${c.telefone}`}
                          >
                            <MessageCircle className="h-3 w-3" />
                            WhatsApp
                          </a>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">sem tel</span>
                        )}
                        <button
                          onClick={() => registrarContatoAgora(c.id, c.nome)}
                          disabled={registrandoContato === c.id}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded bg-sky-500/10 text-sky-700 dark:text-sky-400 hover:bg-sky-500/20 text-xs disabled:opacity-50"
                          title="Registrar contato realizado agora (liga/whats/sala) — atualiza Último contato e recalcula próximo contato"
                        >
                          {registrandoContato === c.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Phone className="h-3 w-3" />
                          )}
                          Contato
                        </button>
                        <button
                          onClick={() => registrarReuniaoAgora(c.id, c.nome)}
                          disabled={registrandoReuniao === c.id}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded bg-amber-500/10 text-amber-700 dark:text-amber-400 hover:bg-amber-500/20 text-xs disabled:opacity-50"
                          title="Registrar reunião realizada agora (preenche Última reunião e Último contato)"
                        >
                          {registrandoReuniao === c.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <CalendarPlus className="h-3 w-3" />
                          )}
                          Reunião
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {ordenados.length === 0 && (
                <tr>
                  <td colSpan={12} className="px-4 py-8 text-center text-muted-foreground">
                    {clientes.length === 0
                      ? "Nenhum cliente importado. Use o botão Importar dados acima."
                      : "Nenhum cliente encontrado com os filtros atuais."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Subcomponentes ───────────────────────────────────────────────────────

function Th({
  children,
  onClick,
  align = "left",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  align?: "left" | "right";
}) {
  return (
    <th
      className={`${align === "right" ? "text-right" : "text-left"} px-3 py-3 font-medium text-muted-foreground ${
        onClick ? "cursor-pointer select-none hover:text-foreground" : ""
      }`}
      onClick={onClick}
    >
      <span className={`inline-flex items-center gap-1 ${align === "right" ? "flex-row-reverse" : ""}`}>
        {children}
      </span>
    </th>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: typeof TrendingUp;
  label: string;
  value: string;
  sub: string;
  tone: "ok" | "atencao" | "alerta" | "neutro";
}) {
  const tones: Record<string, string> = {
    ok: "border-emerald-500/30 bg-emerald-500/5",
    atencao: "border-amber-500/30 bg-amber-500/5",
    alerta: "border-red-500/30 bg-red-500/5",
    neutro: "border-border bg-muted/30",
  };
  const iconTones: Record<string, string> = {
    ok: "text-emerald-600",
    atencao: "text-amber-600",
    alerta: "text-red-600",
    neutro: "text-muted-foreground",
  };
  return (
    <div className={`rounded-lg border p-3 ${tones[tone]}`}>
      <div className="flex items-center gap-2 mb-1">
        <Icon className={`h-4 w-4 ${iconTones[tone]}`} />
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
      </div>
      <div className="text-xl font-bold">{value}</div>
      <div className="text-xs text-muted-foreground">{sub}</div>
    </div>
  );
}
