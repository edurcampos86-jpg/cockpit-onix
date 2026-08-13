// Tempo de ciclo das PRs mergeadas: mediana, média e p90, do lote inteiro e
// separado em dois blocos (metade mais antiga / metade mais recente), mais a
// mediana por faixa de risco inferida dos arquivos tocados.
//
// A mediana é o número principal. Média é reportada só para contraste: duas ou
// três PRs paradas por meses puxam a média para cima e escondem o comportamento
// típico do lote.
//
//   node scripts/metricas-ciclo.mjs                  # 40 PRs, via gh CLI
//   node scripts/metricas-ciclo.mjs --limit 60
//   node scripts/metricas-ciclo.mjs --from cache.json  # sem gh (CI, container)
//   node scripts/metricas-ciclo.mjs --json           # saída bruta, sem markdown
//
// O formato de --from é o mesmo JSON que `gh pr list --json ...` devolve:
// [{ number, title, createdAt, mergedAt, additions, deletions, files: [{path}] }]

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const CAMPOS = "number,title,createdAt,mergedAt,additions,deletions,files";

function lerArgs(argv) {
  const args = { limite: 40, de: null, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--limit") args.limite = Number(argv[++i]);
    else if (a === "--from") args.de = argv[++i];
    else if (a === "--json") args.json = true;
    else if (a === "--help" || a === "-h") args.ajuda = true;
    else throw new Error(`argumento desconhecido: ${a}`);
  }
  if (!Number.isInteger(args.limite) || args.limite < 1) {
    throw new Error("--limit precisa ser inteiro positivo");
  }
  return args;
}

function puxarDoGh(limite) {
  // `gh pr list --state merged` já devolve só o que foi mergeado, mas o campo
  // mergedAt é conferido abaixo de todo jeito: PR fechada sem merge não tem
  // ciclo para medir e envenenaria a mediana com um valor inventado.
  const saida = execFileSync(
    "gh",
    ["pr", "list", "--state", "merged", "--limit", String(limite), "--json", CAMPOS],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
  );
  return JSON.parse(saida);
}

// Faixa de risco por heurística de caminho — é aproximação declarada, não a
// classificação da alçada (essa é decidida no prompt da tarefa e conferida pelo
// auditor). Serve para responder "migration custa mais caro que doc?".
const RE_VERMELHA = /^prisma\//;
const RE_VERDE = /^docs\/|^\.github\/|\.md$|(^|\/)[^/]*\.test\.[jt]sx?$|(^|\/)__tests__\//;

export function faixaDe(caminhos) {
  if (!caminhos || caminhos.length === 0) return "indefinida";
  if (caminhos.some((c) => RE_VERMELHA.test(c))) return "vermelha";
  if (caminhos.every((c) => RE_VERDE.test(c))) return "verde";
  return "amarela";
}

function normalizar(prs) {
  return prs
    .filter((pr) => pr.mergedAt && pr.createdAt)
    .map((pr) => {
      const caminhos = (pr.files ?? []).map((f) => f.path ?? f.filename ?? f);
      const horas = (Date.parse(pr.mergedAt) - Date.parse(pr.createdAt)) / 3_600_000;
      return {
        numero: pr.number,
        titulo: pr.title,
        criadaEm: pr.createdAt,
        mergeadaEm: pr.mergedAt,
        horas,
        linhas: (pr.additions ?? 0) + (pr.deletions ?? 0),
        arquivos: caminhos.length,
        faixa: faixaDe(caminhos),
      };
    })
    .sort((a, b) => Date.parse(a.mergeadaEm) - Date.parse(b.mergeadaEm));
}

export function percentil(valores, p) {
  if (valores.length === 0) return null;
  const ordenados = [...valores].sort((a, b) => a - b);
  // Nearest-rank: devolve sempre um valor observado, nunca um interpolado que
  // não corresponde a nenhuma PR real. Em lote de 20 isso importa.
  const posicao = Math.ceil((p / 100) * ordenados.length);
  return ordenados[Math.min(Math.max(posicao, 1), ordenados.length) - 1];
}

export function resumo(itens) {
  const horas = itens.map((i) => i.horas);
  if (horas.length === 0) return { n: 0 };
  return {
    n: horas.length,
    mediana: percentil(horas, 50),
    media: horas.reduce((s, h) => s + h, 0) / horas.length,
    p90: percentil(horas, 90),
    min: Math.min(...horas),
    max: Math.max(...horas),
  };
}

function h(valor) {
  if (valor === null || valor === undefined) return "—";
  if (valor >= 48) return `${valor.toFixed(1)} h (${(valor / 24).toFixed(1)} d)`;
  return `${valor.toFixed(1)} h`;
}

function linhaResumo(rotulo, r) {
  if (!r.n) return `| ${rotulo} | 0 | — | — | — | — |`;
  return `| ${rotulo} | ${r.n} | **${h(r.mediana)}** | ${h(r.media)} | ${h(r.p90)} | ${h(r.min)} – ${h(r.max)} |`;
}

function markdown(itens, meta) {
  const metade = Math.floor(itens.length / 2);
  const antigas = itens.slice(0, metade);
  const recentes = itens.slice(itens.length - metade);
  const faixas = ["vermelha", "amarela", "verde", "indefinida"];

  const l = [];
  l.push(`Lote: **${itens.length}** PRs mergeadas, de #${itens[0].numero} (${itens[0].mergeadaEm.slice(0, 10)}) a #${itens[itens.length - 1].numero} (${itens[itens.length - 1].mergeadaEm.slice(0, 10)}).`);
  l.push(`Medido em **${meta.medidoEm}**, fonte \`${meta.fonte}\`.`);
  l.push("");
  l.push("## Lote inteiro e os dois blocos");
  l.push("");
  l.push("| bloco | n | mediana | média | p90 | mín – máx |");
  l.push("|---|---:|---:|---:|---:|---|");
  l.push(linhaResumo("todas", resumo(itens)));
  l.push(linhaResumo(`${metade} mais antigas`, resumo(antigas)));
  l.push(linhaResumo(`${metade} mais recentes`, resumo(recentes)));
  l.push("");
  l.push("## Por faixa de risco (heurística de caminho)");
  l.push("");
  l.push("`prisma/**` ⇒ vermelha · só `docs/`, `.md`, `.github/` ou teste ⇒ verde · resto ⇒ amarela.");
  l.push("");
  l.push("| faixa | n | mediana | média | p90 | mín – máx |");
  l.push("|---|---:|---:|---:|---:|---|");
  for (const f of faixas) {
    const doGrupo = itens.filter((i) => i.faixa === f);
    if (doGrupo.length) l.push(linhaResumo(f, resumo(doGrupo)));
  }
  l.push("");
  l.push("## PRs do lote");
  l.push("");
  l.push("| # | mergeada | ciclo (h) | faixa | linhas | título |");
  l.push("|---:|---|---:|---|---:|---|");
  for (const i of [...itens].reverse()) {
    l.push(`| ${i.numero} | ${i.mergeadaEm.slice(0, 10)} | ${i.horas.toFixed(1)} | ${i.faixa} | ${i.linhas} | ${i.titulo.replace(/\|/g, "\\|")} |`);
  }
  return l.join("\n");
}

function principal() {
  const args = lerArgs(process.argv.slice(2));
  if (args.ajuda) {
    console.log("uso: node scripts/metricas-ciclo.mjs [--limit N] [--from arquivo.json] [--json]");
    return;
  }

  const cru = args.de
    ? JSON.parse(readFileSync(args.de, "utf8"))
    : puxarDoGh(args.limite);
  const itens = normalizar(cru).slice(-args.limite);

  if (itens.length === 0) {
    console.error("nenhuma PR mergeada com createdAt/mergedAt no lote");
    process.exit(1);
  }
  if (itens.length < args.limite) {
    console.error(`aviso: ${itens.length} PRs utilizáveis de ${args.limite} pedidas`);
  }
  const semArquivos = itens.filter((i) => i.faixa === "indefinida").length;
  if (semArquivos) {
    console.error(`aviso: ${semArquivos} PR(s) sem lista de arquivos — faixa indefinida`);
  }

  if (args.json) {
    console.log(JSON.stringify({ itens, resumo: resumo(itens) }, null, 2));
    return;
  }
  console.log(
    markdown(itens, {
      medidoEm: new Date().toISOString().slice(0, 10),
      fonte: args.de ?? `gh pr list --state merged --limit ${args.limite}`,
    })
  );
}

// Só roda quando chamado direto — as funções acima são importáveis por teste.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  principal();
}
