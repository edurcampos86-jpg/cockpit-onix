"use client";

/* ──────────────────────────────────────────────────────────────
 * A tela de import da Onix Corretora.
 *
 * ── A ORDEM É A PROTEÇÃO ────────────────────────────────────────────────
 * Arquivo → perfil e mapeamento → ENSAIO → gravar. O botão de gravar só
 * aparece depois de um ensaio, e a máquina de estados
 * (`@/lib/importacao-ui/estado-importacao`) desliga o botão sozinho se
 * qualquer coisa mudar depois do ensaio: outro arquivo, outro mapeamento,
 * outra competência, outro parceiro.
 *
 * Sem isso o caminho mais natural do mundo grava outra coisa: ensaio, vejo
 * "2.610 atualizações", ajusto um mapeamento porque reparei num erro, e clico
 * em gravar lendo os números do ensaio ANTERIOR.
 *
 * ── COMPETÊNCIA ─────────────────────────────────────────────────────────
 * O caminho normal é a COLUNA DO ARQUIVO. Digitar à mão existe, aparece como
 * exceção declarada em amarelo, e nunca como caminho padrão: competência
 * errada não estraga esta importação — estraga a próxima, quando a regra de
 * precedência comparar contra uma data inventada.
 *
 * ── RÓTULO DESCONHECIDO NUNCA VIRA CHUTE ────────────────────────────────
 * A tela não sugere "parece `premio`". Coluna sem destino fica sem destino, e
 * palavra que o dicionário não conhece fica na lista de pendentes, mapeável
 * ali mesmo — o perfil aprende com a correção, não com adivinhação.
 * ────────────────────────────────────────────────────────────── */

import { useCallback, useMemo, useReducer, useState } from "react";

import {
  CAMPOS_DESTINO,
  destinosDuplicados,
  faltamObrigatorios,
  rotuloDoCampo,
  type GrupoDestino,
} from "@/lib/importacao-ui/campos-destino";
import {
  ESTADO_INICIAL,
  competenciaEhExcecao,
  impedimentosDoEnsaio,
  impressaoDoPerfil,
  podeAplicar,
  reduzir,
} from "@/lib/importacao-ui/estado-importacao";
import { mesclarDicionarios } from "@/lib/importacao-ui/merge-dicionarios";
import {
  COMPETENCIA_A_MAO,
  COMPETENCIA_DO_ARQUIVO,
  ERROS,
  EXPLICACOES,
  avisoDeAntiguidade,
  avisoDeSobrescrita,
  estadoVazioDoEnsaio,
  textoDaConfirmacao,
} from "@/lib/importacao-ui/textos-ensaio";

const NOMES_DE_GRUPO: Record<GrupoDestino, string> = {
  identificacao: "Quem é o cliente",
  contrato: "O contrato",
  valores: "Dinheiro",
  pessoas: "Quem atendeu",
  competencia: "De que mês é o relatório",
};

type Perfil = {
  id: string;
  nome: string;
  fonte: string;
  formato: string;
  ativo: boolean;
  mapeamentoColunas: Record<string, string>;
  dicionarios: Record<string, Record<string, string>>;
  leCompetenciaDoArquivo: boolean;
};

type Sonda = {
  colunas: string[];
  amostra: { numero: number; celulas: Record<string, string> }[];
  avisos: string[];
  linhasLidas: number;
};

type Resultado = {
  modo: string;
  loteImportacao: string;
  linhasLidas: number;
  pessoasACriar: number;
  pessoasACasar: number;
  contratosACriar: number;
  contratosAAtualizar: number;
  historicoPreservado: { chave: string; statusAtual: string; statusRecusado: string; linha: number }[];
  duplicadasNoLote: { linha: number; chave: string }[];
  ignoradasPorAntiguidade: {
    chave: string;
    linha: number;
    referenciaDoLote: string;
    referenciaGravada: string;
  }[];
  // Os nomes vêm do motor: `LinhaRejeitada.numero` (não `linha`) e
  // `RotuloNaoMapeado.linhas` é CONTAGEM, não lista — `exemplos` é a lista.
  rejeitadas: { numero: number; motivo: string }[];
  rotulosNaoMapeados: { campo: string; rotulo: string; linhas: number; exemplos: number[] }[];
  grafiasAtendente: { nome: string; linhas: number }[];
  amostra: unknown[];
  custoIa: { usd: number; modelo: string } | null;
  avisos: string[];
  pessoasCriadas: number;
  contratosCriados: number;
  contratosAtualizados: number;
  interrompido: boolean;
};

const FORMATO_DO_NOME = (nome: string): string => {
  const ext = nome.toLowerCase().split(".").pop() ?? "";
  if (ext === "xlsx" || ext === "xls") return "xlsx";
  if (ext === "csv" || ext === "txt") return "csv";
  if (ext === "pdf") return "pdf";
  if (ext === "docx" || ext === "doc") return "docx";
  return ext;
};

export function ImportarCorretora() {
  const [estado, despachar] = useReducer(reduzir, ESTADO_INICIAL);
  const [arquivoBruto, setArquivoBruto] = useState<File | null>(null);
  const [perfis, setPerfis] = useState<Perfil[] | null>(null);
  const [sonda, setSonda] = useState<Sonda | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [gravado, setGravado] = useState<Resultado | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<null | "sondando" | "ensaiando" | "gravando">(null);
  const [aprendizado, setAprendizado] = useState<Record<string, Record<string, string>>>({});
  const [confirmando, setConfirmando] = useState(false);
  const [criando, setCriando] = useState<{ nome: string; fonte: string } | null>(null);
  const [avisoPerfil, setAvisoPerfil] = useState<string | null>(null);
  const [descoberta, setDescoberta] = useState<{
    colunas: { rotulo: string; exemplo: string }[];
    custoUsd: number;
    aviso: string | null;
  } | null>(null);

  const perfil = useMemo(
    () => perfis?.find((p) => p.id === estado.perfilId) ?? null,
    [perfis, estado.perfilId],
  );
  // O perfil lê o mês do arquivo se ele já mapeava a coluna OU se a pessoa
  // acabou de apontá-la na tabela — as duas fontes valem, e o estado da tela é
  // a mais nova das duas.
  const perfilLeCompetencia =
    Object.values(estado.mapeamento).includes("dataReferencia") ||
    (perfil?.leCompetenciaDoArquivo ?? false);
  // Perfil de xlsx com CSV na mão não é erro de digitação inofensivo: o leitor
  // abriria o arquivo errado e o motivo sairia como falha de extração.
  const formatoBate =
    perfil === null || estado.arquivo === null
      ? true
      : perfil.formato === FORMATO_DO_NOME(estado.arquivo.nome);
  const impedimentos = impedimentosDoEnsaio(estado);
  const duplicados = destinosDuplicados(estado.mapeamento);

  const carregarPerfis = useCallback(async (): Promise<Perfil[] | null> => {
    const r = await fetch("/api/empresas/corretora/perfis");
    const j = await r.json();
    if (!r.ok) {
      setErro(j.error ?? ERROS.perfilNaoEncontrado);
      return null;
    }
    setPerfis(j.perfis);
    return j.perfis as Perfil[];
  }, []);

  const MAX_MB = 20;

  async function escolherArquivo(f: File) {
    setErro(null);
    if (f.size > MAX_MB * 1024 * 1024) {
      // Barrar aqui evita subir 31 MB para receber 413 do outro lado.
      setErro(ERROS.arquivoGrande(MAX_MB, Math.round(f.size / 1024 / 1024)));
      return;
    }
    setResultado(null);
    setGravado(null);
    setSonda(null);
    setDescoberta(null);
    setArquivoBruto(f);
    despachar({
      tipo: "escolheu-arquivo",
      arquivo: { nome: f.name, tamanhoBytes: f.size, colunas: [] },
    });
    if (perfis === null) await carregarPerfis();

    const formato = FORMATO_DO_NOME(f.name);
    if (formato !== "xlsx" && formato !== "csv") return; // PDF/Word: só por perfil

    setOcupado("sondando");
    try {
      const corpo = new FormData();
      corpo.set("arquivo", f);
      corpo.set("formato", formato);
      const r = await fetch("/api/empresas/corretora/importar/sondar", {
        method: "POST",
        body: corpo,
      });
      const j = await r.json();
      if (!r.ok) setErro(j.error);
      else setSonda(j);
    } catch {
      setErro(ERROS.leituraFalhou);
    } finally {
      setOcupado(null);
    }
  }

  function escolherPerfil(id: string) {
    const p = perfis?.find((x) => x.id === id);
    if (!p) return;
    if (!p.ativo) {
      setErro(ERROS.perfilInativo);
      return;
    }
    setErro(null);
    setResultado(null);
    setAprendizado({});
    despachar({
      tipo: "escolheu-perfil",
      perfilId: id,
      mapeamento: p.mapeamentoColunas ?? {},
      // Assina o CONTEÚDO do perfil, não só o id: o plano é montado no servidor
      // a partir do que está no banco, e o dicionário pode mudar por fora.
      impressaoDoPerfil: impressaoDoPerfil(p),
    });
  }

  async function chamarImportar(modo: "dry-run" | "aplicar") {
    if (!arquivoBruto || !estado.perfilId) return;
    setErro(null);
    setOcupado(modo === "dry-run" ? "ensaiando" : "gravando");
    if (modo === "aplicar") despachar({ tipo: "aplicando" });
    try {
      const corpo = new FormData();
      corpo.set("arquivo", arquivoBruto);
      corpo.set("perfilId", estado.perfilId);
      corpo.set("modo", modo);
      if (modo === "aplicar") corpo.set("confirmar", "true");
      if (estado.competencia.origem === "manual") {
        corpo.set("competencia", estado.competencia.valor.trim());
      }
      if (estado.parceiroPadrao.trim()) corpo.set("parceiroPadrao", estado.parceiroPadrao.trim());
      // Sem isto a tela de mapeamento seria decorativa: o servidor montaria o
      // plano com o mapeamento gravado no perfil, não com o que está na tela.
      corpo.set("mapeamentoColunas", JSON.stringify(estado.mapeamento));

      const r = await fetch("/api/empresas/corretora/importar", { method: "POST", body: corpo });
      const j = await r.json();
      if (!r.ok) {
        setErro(j.error ?? "não deu para ler a resposta do servidor");
        despachar({ tipo: "falhou" });
        return;
      }
      if (modo === "dry-run") {
        setResultado(j);
        despachar({ tipo: "ensaiou" });
      } else {
        setGravado(j);
        setResultado(j);
        despachar({ tipo: "aplicou" });
      }
    } catch {
      // Ensaio não escreve; gravar escreve em lotes e pode ter entrado parte.
      setErro(modo === "dry-run" ? ERROS.leituraFalhou : ERROS.conexaoPerdida);
      despachar({ tipo: "falhou" });
    } finally {
      setOcupado(null);
      setConfirmando(false);
    }
  }

  /**
   * Cria um perfil com o mapeamento montado aqui.
   *
   * É o que tira a tela do ovo: sem esta função ela só serve parceiro que já
   * tem perfil, e não havia como criar o primeiro por lugar nenhum.
   */
  /**
   * Descobre as colunas de um PDF ou Word.
   *
   * A sonda de planilha lê o cabeçalho e pronto; aqui não existe cabeçalho
   * declarado. Sem este botão, PDF e Word chegavam à tela de mapeamento em
   * branco e a pessoa tinha de digitar cada rótulo olhando o arquivo noutra
   * janela — que é onde o erro de digitação vira coluna que não existe.
   *
   * Em Word não custa nada; em PDF custa uma página de Haiku, e o valor
   * medido aparece na tela.
   */
  async function descobrirColunas() {
    if (!arquivoBruto || !estado.arquivo) return;
    setErro(null);
    setOcupado("sondando");
    try {
      const corpo = new FormData();
      corpo.set("arquivo", arquivoBruto);
      corpo.set("formato", FORMATO_DO_NOME(estado.arquivo.nome));
      const r = await fetch("/api/empresas/corretora/importar/descobrir", {
        method: "POST",
        body: corpo,
      });
      const j = await r.json();
      if (!r.ok) {
        setErro(j.error);
        return;
      }
      setDescoberta({ colunas: j.colunas, custoUsd: j.custoUsd, aviso: j.aviso });
      // Popula a tabela de mapeamento com o que voltou — os destinos ficam
      // vazios de propósito: descobrir o rótulo não é adivinhar o destino.
      setSonda({
        colunas: j.colunas.map((c: { rotulo: string }) => c.rotulo),
        amostra:
          j.colunas.length > 0
            ? [
                {
                  numero: 1,
                  celulas: Object.fromEntries(
                    j.colunas.map((c: { rotulo: string; exemplo: string }) => [c.rotulo, c.exemplo]),
                  ),
                },
              ]
            : [],
        avisos: j.aviso ? [j.aviso] : [],
        linhasLidas: 0,
      });
    } catch {
      setErro(ERROS.leituraFalhou);
    } finally {
      setOcupado(null);
    }
  }

  async function criarPerfil() {
    if (!criando || !estado.arquivo) return;
    setErro(null);
    setOcupado("gravando");
    try {
      const r = await fetch("/api/empresas/corretora/perfis", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          nome: criando.nome,
          fonte: criando.fonte,
          formato: FORMATO_DO_NOME(estado.arquivo.nome),
          mapeamentoColunas: estado.mapeamento,
        }),
      });
      const j = await r.json();
      if (!r.ok) {
        setErro(j.problemas ? `${j.error}: ${j.problemas.join("; ")}` : j.error);
        return;
      }
      setCriando(null);
      if (j.aviso) setAvisoPerfil(j.aviso);
      const lista = await carregarPerfis();
      const novo = lista?.find((x) => x.id === j.perfil.id);
      if (novo) {
        despachar({
          tipo: "escolheu-perfil",
          perfilId: novo.id,
          mapeamento: novo.mapeamentoColunas ?? {},
          impressaoDoPerfil: impressaoDoPerfil(novo),
        });
      }
    } catch {
      setErro(ERROS.leituraFalhou);
    } finally {
      setOcupado(null);
    }
  }

  /**
   * Desativa o perfil escolhido. Não apaga: os contratos já importados
   * continuam apontando para ele, e é assim que se sabe como cada lote foi
   * lido. Some da lista de escolha, e só.
   */
  async function desativarPerfil() {
    if (!perfil) return;
    setErro(null);
    setOcupado("gravando");
    try {
      const r = await fetch(`/api/empresas/corretora/perfis/${perfil.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ativo: false }),
      });
      const j = await r.json();
      if (!r.ok) {
        setErro(j.error);
        return;
      }
      setResultado(null);
      setAprendizado({});
      despachar({ tipo: "escolheu-arquivo", arquivo: estado.arquivo! });
      await carregarPerfis();
    } catch {
      setErro(ERROS.leituraFalhou);
    } finally {
      setOcupado(null);
    }
  }

  async function salvarNoPerfil() {
    if (!estado.perfilId) return;
    setErro(null);
    setOcupado("gravando");
    try {
      const r = await fetch(`/api/empresas/corretora/perfis/${estado.perfilId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mapeamentoColunas: estado.mapeamento,
          dicionarios: aprendizado,
        }),
      });
      const j = await r.json();
      if (!r.ok) {
        setErro(j.problemas ? `${j.error}: ${j.problemas.join("; ")}` : j.error);
        return;
      }
      setAprendizado({});
      setResultado(null);
      // O perfil mudou no banco: recarregar zera a impressão e, com ela, o
      // ensaio — que descrevia um plano montado com o dicionário antigo.
      const lista = await carregarPerfis();
      const novo = lista?.find((x) => x.id === estado.perfilId);
      if (novo) {
        despachar({
          tipo: "escolheu-perfil",
          perfilId: novo.id,
          mapeamento: novo.mapeamentoColunas ?? {},
          impressaoDoPerfil: impressaoDoPerfil(novo),
        });
      }
    } catch {
      setErro(ERROS.conexaoPerdida);
    } finally {
      setOcupado(null);
    }
  }

  /**
   * As palavras que dá para ensinar, das DUAS fontes.
   *
   * `rotulosNaoMapeados` só existe quando o perfil já tem dicionário para o
   * campo (`aplicar-perfil.ts`). Em perfil novo, ou em campo sem dicionário, a
   * palavra desconhecida nunca vira pendente: ela passa crua e morre em
   * `montarRegistro` como linha recusada, com o motivo
   * `tipoProduto sem mapeamento: "X"`.
   *
   * Sem ler as recusadas, a tela mostrava trezentas linhas recusadas pela
   * mesma palavra e nenhum caminho para resolvê-la — que é o oposto do que
   * "rótulo desconhecido nunca vira chute, fica pendente" promete.
   */
  const ensinaveis = useMemo(() => {
    const mapa = new Map<string, { campo: string; rotulo: string; linhas: number; exemplos: number[] }>();
    for (const p of resultado?.rotulosNaoMapeados ?? []) {
      mapa.set(`${p.campo}:${p.rotulo}`, { ...p });
    }
    for (const r of resultado?.rejeitadas ?? []) {
      const m = /(\w+) sem mapeamento: "([^"]*)"/.exec(r.motivo);
      if (!m) continue;
      const chave = `${m[1]}:${m[2]}`;
      const atual = mapa.get(chave);
      if (atual) {
        atual.linhas += 1;
        if (atual.exemplos.length < 3) atual.exemplos.push(r.numero);
      } else {
        mapa.set(chave, { campo: m[1], rotulo: m[2], linhas: 1, exemplos: [r.numero] });
      }
    }
    return [...mapa.values()].sort((a, b) => b.linhas - a.linhas);
  }, [resultado]);

  const mapeamentoMudou =
    perfil !== null &&
    JSON.stringify(Object.entries(estado.mapeamento).sort()) !==
      JSON.stringify(Object.entries(perfil.mapeamentoColunas ?? {}).sort());

  const previaAprendizado = perfil
    ? mesclarDicionarios(perfil.dicionarios ?? {}, aprendizado)
    : null;

  return (
    <main className="mx-auto max-w-5xl space-y-8 p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Importar relatório da Corretora</h1>
        <p className="text-sm text-neutral-600">
          Suba o arquivo da seguradora, confira o ensaio e só então grave. O ensaio não escreve
          nada.
        </p>
      </header>

      {erro !== null && (
        <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-900">
          {erro}
        </div>
      )}

      {/* ── 1. Arquivo ─────────────────────────────────────────── */}
      <section aria-labelledby="passo-arquivo" className="space-y-3">
        <h2 id="passo-arquivo" className="text-lg font-medium">
          1. O arquivo
        </h2>
        <input
          type="file"
          accept=".xlsx,.xls,.csv,.pdf,.docx"
          aria-label="Arquivo do relatório"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void escolherArquivo(f);
          }}
          className="block w-full rounded border border-neutral-300 p-2 text-sm"
        />
        {estado.arquivo && (
          <p className="text-sm text-neutral-700">
            {estado.arquivo.nome} · {(estado.arquivo.tamanhoBytes / 1024 / 1024).toFixed(1)} MB
            {ocupado === "sondando" && " · lendo o cabeçalho…"}
          </p>
        )}
        {sonda && (
          <p className="text-sm text-neutral-600">
            {sonda.colunas.length} colunas encontradas, {sonda.linhasLidas} linhas de dado.
          </p>
        )}
        {sonda && sonda.avisos.length > 0 && (
          <ul className="list-disc rounded border border-amber-300 bg-amber-50 p-3 pl-8 text-xs text-amber-900">
            {sonda.avisos.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        )}
        {estado.arquivo &&
          !sonda &&
          ocupado !== "sondando" &&
          !["xlsx", "csv"].includes(FORMATO_DO_NOME(estado.arquivo.nome)) && (
            <div className="space-y-2 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <p>
                PDF e Word não têm cabeçalho declarado como planilha. Dá para descobrir as colunas
                lendo a primeira página — ou escolher um perfil que já existe, abaixo.
              </p>
              <button
                type="button"
                disabled={ocupado !== null}
                onClick={() => void descobrirColunas()}
                className="rounded border border-amber-500 px-3 py-1.5 disabled:border-amber-200 disabled:text-amber-400"
              >
                Descobrir colunas
              </button>
              <p className="text-xs">
                {FORMATO_DO_NOME(estado.arquivo.nome) === "docx"
                  ? "Em Word não custa nada: o texto sai do próprio arquivo, sem IA."
                  : "Em PDF vai só a primeira página para a IA — centavos, não a leitura inteira."}
              </p>
            </div>
          )}

          {descoberta !== null && (
            <p className="text-sm text-neutral-700">
              {descoberta.colunas.length} colunas descobertas
              {descoberta.custoUsd > 0
                ? ` · custou US$ ${descoberta.custoUsd.toFixed(4)}`
                : " · sem custo de IA"}
              . Confira cada rótulo contra o arquivo antes de mapear.
            </p>
          )}
      </section>

      {/* ── 2. Perfil e parceiro ───────────────────────────────── */}
      <section aria-labelledby="passo-perfil" className="space-y-3">
        <h2 id="passo-perfil" className="text-lg font-medium">
          2. O perfil e o parceiro
        </h2>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Perfil de leitura</span>
          <select
            value={estado.perfilId ?? ""}
            onChange={(e) => escolherPerfil(e.target.value)}
            className="w-full rounded border border-neutral-300 p-2"
          >
            <option value="">Escolha…</option>
            {(perfis ?? []).map((p) => (
              <option key={p.id} value={p.id} disabled={!p.ativo}>
                {p.nome} · {p.fonte} · {p.formato}
                {p.ativo ? "" : " (desativado)"}
              </option>
            ))}
          </select>
        </label>
        {avisoPerfil !== null && (
          <p className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            {avisoPerfil}
          </p>
        )}

        {perfil && (
          <button
            type="button"
            disabled={ocupado !== null}
            onClick={() => void desativarPerfil()}
            className="text-sm underline disabled:text-neutral-400"
          >
            Desativar “{perfil.nome}” — some da lista, não apaga nada
          </button>
        )}

        {sonda && estado.perfilId === null && criando === null && (
          <button
            type="button"
            onClick={() => setCriando({ nome: "", fonte: "" })}
            className="text-sm underline"
          >
            Parceiro novo — criar um perfil com o mapeamento desta tela
          </button>
        )}

        {criando !== null && (
          <div className="space-y-2 rounded border border-neutral-300 bg-neutral-50 p-3 text-sm">
            <p className="font-medium">Criar perfil novo</p>
            <p className="text-neutral-700">
              Guarda o mapeamento montado abaixo com um nome. No mês que vem, escolher este perfil
              já traz as colunas apontadas.
            </p>
            <label className="block">
              <span className="mb-1 block">Nome do perfil</span>
              <input
                type="text"
                value={criando.nome}
                placeholder="Porto Seguro — apólices mensais"
                onChange={(e) => setCriando({ ...criando, nome: e.target.value })}
                className="w-full rounded border border-neutral-300 p-2"
              />
            </label>
            <label className="block">
              <span className="mb-1 block">Seguradora</span>
              <input
                type="text"
                value={criando.fonte}
                placeholder="Porto Seguro"
                onChange={(e) => setCriando({ ...criando, fonte: e.target.value })}
                className="w-full rounded border border-neutral-300 p-2"
              />
            </label>
            <p className="text-xs text-neutral-600">
              Aponte as colunas obrigatórias abaixo antes de criar — o perfil é conferido com a
              mesma régua da importação, e um perfil incompleto é recusado na hora.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setCriando(null)}
                className="rounded border border-neutral-400 px-3 py-1.5"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={
                  ocupado !== null ||
                  criando.nome.trim() === "" ||
                  criando.fonte.trim() === "" ||
                  faltamObrigatorios(estado.mapeamento).length > 0
                }
                onClick={() => void criarPerfil()}
                className="rounded bg-neutral-900 px-3 py-1.5 text-white disabled:bg-neutral-300"
              >
                Criar perfil
              </button>
            </div>
          </div>
        )}

        <label className="block text-sm">
          <span className="mb-1 block font-medium">Parceiro (seguradora) deste relatório</span>
          <input
            type="text"
            value={estado.parceiroPadrao}
            placeholder={perfil?.fonte ?? "usa o parceiro do perfil"}
            onChange={(e) => despachar({ tipo: "definiu-parceiro-padrao", valor: e.target.value })}
            className="w-full rounded border border-neutral-300 p-2"
          />
          <span className="mt-1 block text-xs text-neutral-600">
            Vale só nas linhas em que o arquivo não trouxer a seguradora. Se a planilha tem essa
            coluna, ela vence linha a linha.
          </span>
        </label>
      </section>

      {/* ── 3. Mapeamento ──────────────────────────────────────── */}
      {sonda && (
        <section aria-labelledby="passo-mapa" className="space-y-3">
          <h2 id="passo-mapa" className="text-lg font-medium">
            3. Para onde vai cada coluna
          </h2>
          <p className="text-sm text-neutral-600">
            Coluna sem destino é ignorada — e continua ignorada. A tela não adivinha.
          </p>
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">Colunas do arquivo e seus destinos</caption>
            <thead>
              <tr className="border-b border-neutral-300 text-left">
                <th scope="col" className="py-2">Coluna do arquivo</th>
                <th scope="col" className="py-2">Exemplo</th>
                <th scope="col" className="py-2">Vai para</th>
              </tr>
            </thead>
            <tbody>
              {sonda.colunas.map((coluna) => (
                <tr key={coluna} className="border-b border-neutral-100">
                  <td className="py-2 font-medium">{coluna}</td>
                  <td className="py-2 text-neutral-500">
                    {sonda.amostra[0]?.celulas[coluna] ?? "—"}
                  </td>
                  <td className="py-2">
                    <select
                      aria-label={`Destino da coluna ${coluna}`}
                      value={estado.mapeamento[coluna] ?? ""}
                      onChange={(e) =>
                        despachar({
                          tipo: "mapeou",
                          rotulo: coluna,
                          campo: e.target.value === "" ? null : e.target.value,
                        })
                      }
                      className="w-full rounded border border-neutral-300 p-1"
                    >
                      <option value="">Ignorar esta coluna</option>
                      {(Object.keys(NOMES_DE_GRUPO) as GrupoDestino[]).map((grupo) => (
                        <optgroup key={grupo} label={NOMES_DE_GRUPO[grupo]}>
                          {CAMPOS_DESTINO.filter((c) => c.grupo === grupo).map((c) => (
                            <option key={c.campo} value={c.campo}>
                              {c.rotulo}
                              {c.obrigatorio ? " *" : ""}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {duplicados.length > 0 && (
            <p role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-900">
              {duplicados
                .map(
                  (d) =>
                    `${d.origens.join(" e ")} apontam as duas para ${rotuloDoCampo(d.campo)}. Escolha uma: a segunda apagaria a primeira em silêncio.`,
                )
                .join(" ")}
            </p>
          )}
        </section>
      )}

      {/* ── 4. Competência ─────────────────────────────────────── */}
      <section aria-labelledby="passo-mes" className="space-y-3">
        <h2 id="passo-mes" className="text-lg font-medium">
          4. De que mês é o relatório
        </h2>
        {estado.competencia.origem === "coluna" ? (
          perfilLeCompetencia ? (
            <div className="rounded border border-neutral-300 bg-neutral-50 p-3 text-sm">
              <p className="font-medium">{COMPETENCIA_DO_ARQUIVO.titulo}</p>
              <p className="text-neutral-700">{COMPETENCIA_DO_ARQUIVO.corpo}</p>
              <button
                type="button"
                onClick={() => despachar({ tipo: "competencia-manual", valor: "" })}
                className="mt-2 text-sm underline"
              >
                Este arquivo não tem essa coluna — informar à mão
              </button>
            </div>
          ) : (
            // O servidor já calcula `leCompetenciaDoArquivo` justamente para a
            // tela não afirmar "vem do arquivo" num perfil que não lê o mês.
            <div className="rounded border border-neutral-300 bg-neutral-50 p-3 text-sm">
              <p className="font-medium">
                {estado.perfilId
                  ? "Este perfil não lê o mês do arquivo."
                  : "Escolha o perfil para saber de onde vem o mês."}
              </p>
              <p className="text-neutral-700">
                {estado.perfilId
                  ? "Aponte uma coluna para “Competência (mês do relatório)” na tabela acima, ou informe o mês à mão."
                  : "Perfis diferentes leem o mês de lugares diferentes."}
              </p>
              <button
                type="button"
                onClick={() => despachar({ tipo: "competencia-manual", valor: "" })}
                className="mt-2 text-sm underline"
              >
                Informar o mês à mão
              </button>
            </div>
          )
        ) : (
          <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <p className="font-medium">{COMPETENCIA_A_MAO.titulo}</p>
            <p>{COMPETENCIA_A_MAO.corpo}</p>
            <label className="mt-2 block">
              <span className="sr-only">Competência do relatório, no formato AAAA-MM</span>
              <input
                type="text"
                inputMode="numeric"
                placeholder={COMPETENCIA_A_MAO.mascara}
                value={estado.competencia.valor}
                onChange={(e) => despachar({ tipo: "competencia-manual", valor: e.target.value })}
                className="rounded border border-amber-400 p-2"
              />
              <span className="ml-2 text-xs">Exemplo: {COMPETENCIA_A_MAO.exemplo}</span>
            </label>
            <button
              type="button"
              onClick={() => despachar({ tipo: "competencia-da-coluna" })}
              className="mt-2 text-sm underline"
            >
              Voltar a ler do arquivo
            </button>
          </div>
        )}
        {competenciaEhExcecao(estado) && (
          <p className="text-xs text-amber-800">
            Exceção declarada: o valor digitado vale para o relatório inteiro.
          </p>
        )}
      </section>

      {/* ── Salvar no perfil ───────────────────────────────────── */}
      {perfil && (mapeamentoMudou || (previaAprendizado?.adicionados.length ?? 0) > 0) && (
        <section aria-labelledby="salvar-perfil" className="space-y-2">
          <h2 id="salvar-perfil" className="text-lg font-medium">
            Salvar no perfil
          </h2>
          <p className="text-sm text-neutral-600">
            {[
              mapeamentoMudou ? "o mapeamento das colunas" : null,
              (previaAprendizado?.adicionados.length ?? 0) > 0
                ? `${previaAprendizado?.adicionados.length} palavras novas`
                : null,
            ]
              .filter(Boolean)
              .join(" e ")}{" "}
            entram no perfil <strong>{perfil.nome}</strong>, junto com o vocabulário que ele já
            tinha. O mês seguinte chega mapeado.
          </p>
          <button
            type="button"
            disabled={ocupado !== null}
            onClick={() => void salvarNoPerfil()}
            className="rounded border border-neutral-400 px-4 py-2 text-sm disabled:border-neutral-200 disabled:text-neutral-400"
          >
            Salvar no perfil
          </button>
          <p className="text-xs text-neutral-600">
            Salvar invalida o ensaio: ele descrevia um plano montado com o perfil antigo.
            {perfil.formato === "pdf" || perfil.formato === "docx"
              ? " Neste formato o novo ensaio cobra outra leitura por IA — salve depois de resolver tudo."
              : ""}
          </p>
        </section>
      )}

      {/* ── 5. Ensaio ──────────────────────────────────────────── */}
      <section aria-labelledby="passo-ensaio" className="space-y-3">
        <h2 id="passo-ensaio" className="text-lg font-medium">
          5. O ensaio
        </h2>
        {!formatoBate && perfil && estado.arquivo && (
          <p role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-900">
            O perfil <strong>{perfil.nome}</strong> lê arquivos {perfil.formato}, e você escolheu
            um {FORMATO_DO_NOME(estado.arquivo.nome)}. Escolha o perfil do formato certo.
          </p>
        )}
        {impedimentos.length > 0 && (
          <ul className="list-disc space-y-1 pl-5 text-sm text-neutral-700">
            {impedimentos.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
        <button
          type="button"
          disabled={impedimentos.length > 0 || !formatoBate || ocupado !== null}
          onClick={() => void chamarImportar("dry-run")}
          className="rounded bg-neutral-900 px-4 py-2 text-sm text-white disabled:bg-neutral-300"
        >
          {ocupado === "ensaiando" ? "Lendo o arquivo…" : "Rodar o ensaio"}
        </button>
        <p className="text-xs text-neutral-600">
          O ensaio lê o arquivo inteiro e não grava nada.
        </p>
      </section>

      {resultado && <Ensaio r={resultado} gravado={gravado !== null} />}

      {resultado && previaAprendizado && ensinaveis.length > 0 && !gravado && (
        <section aria-labelledby="pendentes" className="space-y-3">
          <h2 id="pendentes" className="text-lg font-medium">
            {EXPLICACOES.rotulosNaoMapeados.rotulo}
          </h2>
          <p className="text-sm text-neutral-600">{EXPLICACOES.rotulosNaoMapeados.ajuda}</p>
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">Palavras pendentes e sua tradução</caption>
            <thead>
              <tr className="border-b border-neutral-300 text-left">
                <th scope="col" className="py-2">Palavra no arquivo</th>
                <th scope="col" className="py-2">Campo</th>
                <th scope="col" className="py-2">Linhas</th>
                <th scope="col" className="py-2">Passa a significar</th>
              </tr>
            </thead>
            <tbody>
              {ensinaveis.map((p) => (
                <tr key={`${p.campo}:${p.rotulo}`} className="border-b border-neutral-100">
                  <td className="py-2 font-medium">{p.rotulo}</td>
                  <td className="py-2">{rotuloDoCampo(p.campo)}</td>
                  <td className="py-2">
                    {p.linhas}
                    {p.exemplos.length > 0 && (
                      <span className="text-neutral-500"> (ex.: {p.exemplos.join(", ")})</span>
                    )}
                  </td>
                  <td className="py-2">
                    <input
                      type="text"
                      aria-label={`Tradução de ${p.rotulo} em ${rotuloDoCampo(p.campo)}`}
                      value={aprendizado[p.campo]?.[p.rotulo] ?? ""}
                      onChange={(e) =>
                        setAprendizado((a) => ({
                          ...a,
                          [p.campo]: { ...(a[p.campo] ?? {}), [p.rotulo]: e.target.value },
                        }))
                      }
                      className="w-full rounded border border-neutral-300 p-1"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {previaAprendizado.redefinidos.length > 0 && (
            <p role="alert" className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              {previaAprendizado.redefinidos
                .map(
                  (r) =>
                    `"${r.rotulo}" já significava ${r.de} e passaria a significar ${r.para}.`,
                )
                .join(" ")}
            </p>
          )}
          <p className="text-xs text-neutral-600">
            Traduzir aqui vale só para o próximo ensaio. Para o perfil aprender de vez, use
            “Salvar no perfil”, abaixo.
          </p>
        </section>
      )}

      {/* ── 6. Gravar ──────────────────────────────────────────── */}
      {resultado && !gravado && (
        <section aria-labelledby="passo-gravar" className="space-y-3">
          <h2 id="passo-gravar" className="text-lg font-medium">
            6. Gravar
          </h2>
          {!podeAplicar(estado) ? (
            <p className="rounded border border-neutral-300 bg-neutral-50 p-3 text-sm">
              Algo mudou depois do ensaio. Rode o ensaio de novo — os números na tela já não
              descrevem o que seria gravado.
            </p>
          ) : confirmando ? (
            <Confirmacao
              r={resultado}
              competencia={
                estado.competencia.origem === "manual"
                  ? estado.competencia.valor
                  : "lida do arquivo"
              }
              ocupado={ocupado === "gravando"}
              onCancelar={() => setConfirmando(false)}
              onGravar={() => void chamarImportar("aplicar")}
            />
          ) : (
            <button
              type="button"
              onClick={() => setConfirmando(true)}
              className="rounded bg-red-700 px-4 py-2 text-sm text-white"
            >
              Gravar na base da Corretora
            </button>
          )}
        </section>
      )}

      {gravado && (
        <section
          aria-labelledby="gravou"
          className="rounded border border-green-300 bg-green-50 p-4 text-sm text-green-900"
        >
          <h2 id="gravou" className="text-lg font-medium">
            Gravado.
          </h2>
          <p>
            {gravado.pessoasCriadas} clientes novos, {gravado.contratosCriados} contratos novos e{" "}
            {gravado.contratosAtualizados} atualizados.
          </p>
          <p className="mt-1 text-xs">
            {EXPLICACOES.loteImportacao.rotulo}: <code>{gravado.loteImportacao}</code>
          </p>
          {gravado.interrompido && (
            <p role="alert" className="mt-2 font-medium">
              {EXPLICACOES.interrompido.rotulo} — {EXPLICACOES.interrompido.ajuda}
            </p>
          )}
        </section>
      )}
    </main>
  );
}

function Numero({ campo, valor }: { campo: keyof typeof EXPLICACOES; valor: number | string }) {
  const e = EXPLICACOES[campo];
  return (
    <div className="rounded border border-neutral-200 p-3">
      <div className="text-2xl font-semibold">{valor}</div>
      <div className="text-sm font-medium">{e.rotulo}</div>
      <p className="mt-1 text-xs text-neutral-600">{e.ajuda}</p>
    </div>
  );
}

function Ensaio({ r, gravado }: { r: Resultado; gravado: boolean }) {
  // `estadoVazioDoEnsaio` é o despachante: ele decide entre "nada a fazer",
  // "nada seria gravado" e "nenhuma linha aproveitada" — e precisa de
  // `rejeitadas` para não dar a causa errada quando tudo foi recusado.
  const vazio = estadoVazioDoEnsaio({ ...r, rejeitadas: r.rejeitadas.length });

  return (
    <section aria-labelledby="resultado" className="space-y-4">
      <h2 id="resultado" className="text-lg font-medium">
        {gravado ? "O que foi gravado" : "O que aconteceria"}
      </h2>

      {vazio && (
        <div className="rounded border border-neutral-300 bg-neutral-50 p-4 text-sm">
          <p className="font-medium">{vazio.titulo}</p>
          <p className="text-neutral-700">{vazio.corpo}</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Numero campo="linhasLidas" valor={r.linhasLidas} />
        <div className="rounded border border-neutral-200 p-3">
          <div className="text-2xl font-semibold">{r.pessoasACriar}</div>
          <div className="text-sm font-medium">Clientes a cadastrar</div>
          <p className="mt-1 text-xs text-neutral-600">
            Não têm CPF/CNPJ na base. Outros {r.pessoasACasar} documentos casaram com quem já
            existe — documentos distintos, não linhas: cinco apólices do mesmo cliente contam uma.
          </p>
        </div>
        <div className="rounded border border-neutral-200 p-3">
          <div className="text-2xl font-semibold">
            {r.contratosACriar} / {r.contratosAAtualizar}
          </div>
          <div className="text-sm font-medium">Contratos novos / atualizados</div>
          <p className="mt-1 text-xs text-neutral-600">
            Novo é apólice que não existe. Atualizado é apólice que já está na base.
          </p>
        </div>
        <Numero campo="historicoPreservado" valor={r.historicoPreservado.length} />
        <Numero campo="ignoradasPorAntiguidade" valor={r.ignoradasPorAntiguidade.length} />
        <Numero campo="grafiasAtendente" valor={r.grafiasAtendente.length} />
        <Numero campo="duplicadasNoLote" valor={r.duplicadasNoLote.length} />
      </div>

      {r.contratosAAtualizar > 0 && !gravado && (
        <p className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          {avisoDeSobrescrita(r.contratosAAtualizar)}
        </p>
      )}

      {r.ignoradasPorAntiguidade.length > 0 && (
        <div className="rounded border border-neutral-300 p-3 text-sm">
          <p>{avisoDeAntiguidade(r.ignoradasPorAntiguidade.length)}</p>
          <table className="mt-2 w-full border-collapse text-xs">
            <caption className="sr-only">Linhas ignoradas por serem de relatório mais antigo</caption>
            <thead>
              <tr className="text-left">
                <th scope="col">Linha</th>
                <th scope="col">Mês deste relatório</th>
                <th scope="col">Mês do que está gravado</th>
              </tr>
            </thead>
            <tbody>
              {r.ignoradasPorAntiguidade.slice(0, 20).map((i) => (
                <tr key={`${i.chave}:${i.linha}`}>
                  <td>{i.linha}</td>
                  <td>{String(i.referenciaDoLote).slice(0, 10)}</td>
                  <td>{String(i.referenciaGravada).slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {r.rejeitadas.length > 0 && (
        <details className="rounded border border-neutral-300 p-3 text-sm">
          <summary className="cursor-pointer font-medium">
            {r.rejeitadas.length} linhas recusadas — o motivo de cada uma
          </summary>
          <ul className="mt-2 space-y-1 text-xs">
            {r.rejeitadas.slice(0, 50).map((x) => (
              <li key={x.numero}>
                Linha {x.numero}: {x.motivo}
              </li>
            ))}
          </ul>
        </details>
      )}

      {r.avisos.length > 0 && (
        <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-medium">{EXPLICACOES.avisos.rotulo}</p>
          <p className="text-xs">{EXPLICACOES.avisos.ajuda}</p>
          <ul className="mt-1 list-disc pl-5 text-xs">
            {r.avisos.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </div>
      )}

      {r.custoIa && (
        <p className="text-xs text-neutral-600">
          Leitura por IA: US$ {r.custoIa.usd.toFixed(4)} ({r.custoIa.modelo}).
        </p>
      )}
    </section>
  );
}

function Confirmacao({
  r,
  competencia,
  ocupado,
  onCancelar,
  onGravar,
}: {
  r: Resultado;
  competencia: string;
  ocupado: boolean;
  onCancelar: () => void;
  onGravar: () => void;
}) {
  const texto = textoDaConfirmacao({
    pessoasACriar: r.pessoasACriar,
    contratosACriar: r.contratosACriar,
    contratosAAtualizar: r.contratosAAtualizar,
    competencia,
  });
  return (
    <div
      role="alertdialog"
      aria-labelledby="confirmar-titulo"
      className="rounded border border-red-300 bg-red-50 p-4 text-sm text-red-900"
    >
      <h3 id="confirmar-titulo" className="text-base font-semibold">
        {texto.titulo}
      </h3>
      <ul className="mt-2 space-y-1">
        {texto.linhas.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={onCancelar}
          className="rounded border border-neutral-400 px-4 py-2"
        >
          Cancelar
        </button>
        <button
          type="button"
          disabled={ocupado}
          onClick={onGravar}
          className="rounded bg-red-700 px-4 py-2 text-white disabled:bg-neutral-300"
        >
          {ocupado ? "Gravando…" : "Gravar agora"}
        </button>
      </div>
    </div>
  );
}
