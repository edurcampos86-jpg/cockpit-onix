"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { Users, Search, Edit2, Check, X, Loader2, Upload } from "lucide-react";

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
  // "Documento" no export do BTG é o TIPO ("CPF", "RG", "DETRAN", "CNH"),
  // não o número — o número fica em "Número Documento".
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
}

type FaixaSaldo = "todos" | "0-10k" | "10k-50k" | "50k-100k" | "100k-500k" | "500k+";

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

export function ClientesTable({
  clientes: iniciais,
  isAdmin = false,
}: {
  clientes: Cliente[];
  isAdmin?: boolean;
}) {
  const [clientes, setClientes] = useState(iniciais);
  const [busca, setBusca] = useState("");
  const [filtroClasse, setFiltroClasse] = useState<"todos" | "A" | "B" | "C">("todos");
  const [filtroSaldoConta, setFiltroSaldoConta] = useState<FaixaSaldo>("todos");
  const [editando, setEditando] = useState<string | null>(null);
  const [importando, setImportando] = useState(false);
  const [importStatus, setImportStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [xlsxReady, setXlsxReady] = useState(false);
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
      let pareados = 0;
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
          pareados += data.duplicadosResolvidos || 0;
        } catch (e) {
          erros.push(`Batch ${i + 1}-${fim}: ${e instanceof Error ? e.message : "erro de rede"}`);
        }
      }

      const partes = [`${criados} novos`, `${atualizados} atualizados`];
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

  const filtrados = clientes.filter((c) => {
    if (filtroClasse !== "todos" && c.classificacao !== filtroClasse) return false;
    if (busca && !c.nome.toLowerCase().includes(busca.toLowerCase())) return false;
    if (filtroSaldoConta !== "todos") {
      const faixa = FAIXAS_SALDO.find((f) => f.valor === filtroSaldoConta);
      if (faixa && (c.saldoConta < faixa.min || c.saldoConta >= faixa.max)) return false;
    }
    return true;
  });

  const contadores = {
    A: clientes.filter((c) => c.classificacao === "A").length,
    B: clientes.filter((c) => c.classificacao === "B").length,
    C: clientes.filter((c) => c.classificacao === "C").length,
  };

  const moeda = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  const atualizarClasse = async (id: string, novaClasse: string) => {
    const res = await fetch(`/api/backoffice/clientes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ classificacao: novaClasse, classificacaoManual: true }),
    });
    if (res.ok) {
      setClientes((prev) =>
        prev.map((c) =>
          c.id === id ? { ...c, classificacao: novaClasse, classificacaoManual: true } : c
        )
      );
      setEditando(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Contadores por classe */}
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
            <p className="text-xs font-medium">{classLegenda[classe]}</p>
          </button>
        ))}
      </div>

      {/* Busca + filtros */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar cliente por nome..."
            className="w-full pl-10 pr-4 py-2 rounded-lg border bg-background text-sm"
          />
        </div>

        {/* Filtro por faixa de saldo em conta */}
        <select
          value={filtroSaldoConta}
          onChange={(e) => setFiltroSaldoConta(e.target.value as FaixaSaldo)}
          className="px-3 py-2 rounded-lg border bg-background text-sm"
          title="Filtrar por saldo em conta corrente"
        >
          {FAIXAS_SALDO.map((f) => (
            <option key={f.valor} value={f.valor}>
              {f.label}
            </option>
          ))}
        </select>

        {(filtroClasse !== "todos" || filtroSaldoConta !== "todos") && (
          <button
            onClick={() => { setFiltroClasse("todos"); setFiltroSaldoConta("todos"); }}
            className="px-3 py-2 rounded-lg border text-sm flex items-center gap-2"
          >
            Limpar filtros <X className="h-3 w-3" />
          </button>
        )}

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
              {importando ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              {importando ? "Importando..." : "Importar dados"}
            </button>
          </>
        )}
      </div>

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

      {/* Tabela */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex items-center gap-3">
          <Users className="h-5 w-5 text-muted-foreground" />
          <h3 className="font-semibold">
            Clientes ({filtrados.length}
            {filtrados.length !== clientes.length && ` de ${clientes.length}`})
          </h3>
        </div>
        <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 sticky top-0 z-10">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Classe</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Nome</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Conta</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">AUM</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Saldo Conta</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Receita/ano</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Último contato</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Última reunião</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Próxima reunião</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtrados.map((c) => (
                <tr key={c.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
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
                        <button
                          onClick={() => setEditando(null)}
                          className="ml-1 text-muted-foreground"
                        >
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
                        {c.classificacaoManual && <Check className="h-3 w-3" />}
                        {!c.classificacaoManual && <Edit2 className="h-3 w-3 opacity-50" />}
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3 font-medium">
                    <Link
                      href={`/backoffice/clientes/${c.id}`}
                      className="hover:underline hover:text-primary"
                    >
                      {c.nome}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                    {c.numeroConta}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">{moeda(c.saldo)}</td>
                  <td className="px-4 py-3 text-right font-mono">
                    {c.saldoConta > 0 ? (
                      <span className="text-emerald-700 dark:text-emerald-400">{moeda(c.saldoConta)}</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                    {moeda(c.receitaAnual)}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {c.ultimoContatoAt
                      ? new Date(c.ultimoContatoAt).toLocaleDateString("pt-BR")
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {c.ultimaReuniaoAt
                      ? new Date(c.ultimaReuniaoAt).toLocaleDateString("pt-BR")
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {c.proximaReuniaoAt ? (
                      <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                        {new Date(c.proximaReuniaoAt).toLocaleDateString("pt-BR")}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {filtrados.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">
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

