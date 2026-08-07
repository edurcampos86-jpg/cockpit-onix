/**
 * Recon de IDENTIDADE do cliente — SOMENTE LEITURA.
 *
 * Mede o que hoje é suposição: se `cpfCnpj` tem cobertura para virar a âncora
 * que liga a mesma pessoa às várias empresas do grupo (Onix Co), e quão
 * ruidosos são os sinais fracos (e-mail, telefone) que teriam de cobrir o
 * resto.
 *
 * ── ONDE MORA A LÓGICA ───────────────────────────────────────────────────
 * Não aqui. As queries e a semântica de cada número vivem em
 * `src/lib/backoffice/recon-identidade.ts`, compartilhado com
 * `GET /api/backoffice/recon-identidade`. Este arquivo é só a camada de
 * apresentação em texto — se um número mudar de significado, muda lá, e os
 * dois consumidores acompanham juntos.
 *
 * ── GARANTIA DE SEGURANÇA ────────────────────────────────────────────────
 * SOMENTE LEITURA. Só `count`, `GROUP BY` e `SELECT`; nenhuma chamada a
 * create/update/upsert/delete/executeRaw, aqui ou no módulo. Seguro de rodar
 * contra produção por construção.
 *
 * ── NENHUM DADO PESSOAL NA SAÍDA ─────────────────────────────────────────
 * Só agregados. Duplicatas saem como CONTAGEM de valores repetidos, nunca
 * como os valores — nem em amostra, nem em mensagem de erro.
 *
 * Como rodar:
 *   npx tsx scripts/recon-identidade.ts
 */

/*
 * `dotenv/config` e o módulo de coleta são os únicos imports estáticos, e é de
 * propósito. O ESM avalia todo import antes do corpo do módulo — se
 * `../src/lib/prisma` fosse estático, ele construiria o cliente com
 * `process.env.DATABASE_URL!` (src/lib/prisma.ts:10) ANTES de qualquer
 * checagem nossa, e a falha por variável ausente sairia como erro interno do
 * driver em vez da mensagem clara que este script promete.
 *
 * O módulo de coleta é seguro como import estático justamente porque NÃO
 * importa `@/lib/prisma` — ele recebe o client por parâmetro.
 */
import "dotenv/config";
import {
  coletarMetricasIdentidade,
  lerFlagRbacEnforcement,
  type Pct,
} from "../src/lib/backoffice/recon-identidade";

/**
 * Referência ao cliente para o `finally` do fim poder desconectar mesmo quando
 * main() morre no meio. Só precisa do contrato de desconexão — tipar como o
 * PrismaClient inteiro obrigaria a importar o tipo estaticamente, que é
 * exatamente o que a nota acima evita.
 */
let clienteAberto: { $disconnect: () => Promise<void> } | null = null;

/* ──────────────────────────────────────────────────────────────────────────
 * Formatação
 * ────────────────────────────────────────────────────────────────────── */

/** Percentual já calculado pelo módulo. `null` = base zero. */
function fmtPct(p: Pct): string {
  return p === null ? "n/a" : `${p.toFixed(1)}%`;
}

/** Linha "rótulo .... valor" alinhada, para saída em texto puro. */
function linha(rotulo: string, valor: string | number, obs = ""): string {
  const v = String(valor);
  const preenchimento = ".".repeat(Math.max(2, 44 - rotulo.length - v.length));
  return `  ${rotulo} ${preenchimento} ${v}${obs ? `   ${obs}` : ""}`;
}

function titulo(n: number, texto: string): string {
  return `\n${n}. ${texto.toUpperCase()}`;
}

/** Quebra um texto longo em linhas indentadas, para as observações do módulo. */
function nota(texto: string, largura = 68): string {
  const palavras = texto.split(/\s+/);
  const linhas: string[] = [];
  let atual = "";
  for (const p of palavras) {
    if ((atual + " " + p).trim().length > largura) {
      linhas.push(atual.trim());
      atual = p;
    } else {
      atual += ` ${p}`;
    }
  }
  if (atual.trim()) linhas.push(atual.trim());
  return linhas.map((l) => `  ${l}`).join("\n");
}

/**
 * Host de destino, SEM credencial.
 *
 * A URL do Postgres carrega usuário e senha; imprimir a string crua vazaria
 * segredo no terminal e em qualquer log que capture a saída. Só host, porta e
 * nome do banco saem daqui — o suficiente para você confirmar "estou olhando
 * produção ou local?" antes de qualquer query.
 */
function descreverDestino(url: string): string {
  try {
    const u = new URL(url);
    const porta = u.port || "5432";
    const banco = u.pathname.replace(/^\//, "") || "(sem nome)";
    return `${u.hostname}:${porta}/${banco}`;
  } catch {
    // URL malformada: não ecoa o valor (pode conter senha), só sinaliza.
    return "(DATABASE_URL não é uma URL válida — host não identificado)";
  }
}

/* ──────────────────────────────────────────────────────────────────────────
 * Execução
 * ────────────────────────────────────────────────────────────────────── */

async function main(): Promise<void> {
  console.log("═".repeat(72));
  console.log("RECON DE IDENTIDADE DO CLIENTE — somente leitura");
  console.log("═".repeat(72));

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL não está definida. Rode a partir da raiz do projeto, com o .env " +
        'carregado (o script já faz `import "dotenv/config"`), ou exporte a variável na shell.',
    );
  }

  // Exigido ANTES de qualquer query: você precisa saber contra qual banco isto
  // vai rodar antes de ver um número sequer.
  console.log(`\nDestino: ${descreverDestino(url)}`);

  // Só agora carrega o cliente da aplicação — ver nota no topo do arquivo.
  const { prisma } = await import("../src/lib/prisma");
  clienteAberto = prisma;

  try {
    await prisma.$connect();
  } catch (e) {
    const motivo = e instanceof Error ? e.message : String(e);
    throw new Error(
      `Não foi possível conectar em ${descreverDestino(url)}.\n` +
        `Motivo do driver: ${motivo}\n` +
        "Verifique se a URL aponta para um banco alcançável a partir desta máquina " +
        "(VPN/proxy do Railway, porta liberada, credencial válida).",
    );
  }
  console.log("Conexão: ok\n");

  const m = await coletarMetricasIdentidade(prisma);

  /* ── 1 ─────────────────────────────────────────────────────────────── */
  console.log(titulo(1, "Total de ClienteBackoffice"));
  console.log(linha("linhas", m.totalClientes.total));

  if (m.totalClientes.total === 0) {
    console.log(
      "\n  Tabela vazia — os itens seguintes não têm o que medir. " +
        "Confira se o destino acima é o banco que você queria.",
    );
    return;
  }

  /* ── 2 ─────────────────────────────────────────────────────────────── */
  const c = m.coberturaCpfCnpj;
  console.log(titulo(2, "Cobertura de cpfCnpj"));
  console.log(linha("preenchido", c.preenchido, fmtPct(c.coberturaPct)));
  console.log(linha("nulo", c.nulo, fmtPct(c.nuloPct)));
  console.log(linha("string vazia (ou só espaços)", c.vazio, fmtPct(c.vazioPct)));
  console.log(`\n  Cobertura efetiva: ${fmtPct(c.coberturaPct)} do total.`);

  /* ── 3 ─────────────────────────────────────────────────────────────── */
  const cge = m.assessorCgeAusente;
  console.log(titulo(3, "assessorCge ausente"));
  console.log(linha("nulo", cge.nulo, fmtPct(cge.nuloPct)));
  console.log(linha("string vazia (ou só espaços)", cge.vazio, fmtPct(cge.vazioPct)));
  console.log(`\n${nota(cge.observacao)}`);

  /* ── 4 ─────────────────────────────────────────────────────────────── */
  const x = m.semCgeESemDocumento;
  console.log(titulo(4, "Cruzamento: sem assessorCge E sem cpfCnpj"));
  console.log(linha("ambos NULL", x.ambosNulos, fmtPct(x.ambosNulosPct)));
  console.log(
    linha("ambos ausentes (NULL ou vazio)", x.ambosAusentes, fmtPct(x.ambosAusentesPct)),
  );
  console.log(`\n${nota(x.observacao)}`);

  /* ── 5 ─────────────────────────────────────────────────────────────── */
  const t = m.distribuicaoTipoConta;
  console.log(titulo(5, "Distribuição por tipoConta"));
  console.log(linha("PF", t.pf, fmtPct(t.pfPct)));
  console.log(linha("PJ", t.pj, fmtPct(t.pjPct)));
  console.log(linha("outros (valor não-PF/PJ)", t.outros, fmtPct(t.outrosPct)));
  console.log(linha("string vazia", t.vazio));
  console.log(linha("nulo", t.nulo));

  /* ── 6 ─────────────────────────────────────────────────────────────── */
  const d = m.tamanhoDocumento;
  console.log(titulo(6, "Tamanho do documento (após remover máscara)"));
  console.log(linha("11 dígitos (CPF)", d.onzeDigitos, fmtPct(d.onzeDigitosPct)));
  console.log(linha("14 dígitos (CNPJ)", d.quatorzeDigitos, fmtPct(d.quatorzeDigitosPct)));
  console.log(
    linha("outro tamanho (inclui 0 dígitos)", d.outroTamanho, fmtPct(d.outroTamanhoPct)),
  );
  console.log("  (percentuais sobre os preenchidos, não sobre o total)");
  if (!d.consistente) {
    console.log(
      "\n  ATENÇÃO: a soma dos baldes não fecha com os preenchidos. " +
        "Trate os números deste item como suspeitos.",
    );
  }

  /* ── 7 ─────────────────────────────────────────────────────────────── */
  const dup = m.duplicatasCpfCnpj;
  console.log(titulo(7, "Duplicatas de cpfCnpj"));
  console.log("  Por dígitos (ignorando máscara) — a leitura que importa:");
  console.log(linha("valores repetidos", dup.porDigitos.valoresRepetidos));
  console.log(
    linha(
      "linhas envolvidas",
      dup.porDigitos.linhasEnvolvidas,
      fmtPct(dup.porDigitos.linhasPct),
    ),
  );
  console.log("\n  Pelo valor cru gravado:");
  console.log(linha("valores repetidos", dup.porValorCru.valoresRepetidos));
  console.log(
    linha(
      "linhas envolvidas",
      dup.porValorCru.linhasEnvolvidas,
      fmtPct(dup.porValorCru.linhasPct),
    ),
  );
  console.log(`\n${nota(dup.observacao)}`);

  /* ── 8 ─────────────────────────────────────────────────────────────── */
  const s = m.sinaisFracosUniao;
  console.log(titulo(8, "Sinais fracos para união — ESTIMATIVA (teto)"));
  console.log(`${nota(s.observacao)}\n`);
  console.log(`  E-mail (normalizado: ${s.email.normalizacao}):`);
  console.log(linha("clientes com e-mail", s.email.clientesComEmail));
  console.log(linha("e-mails em mais de 1 cliente", s.email.valoresRepetidos));
  console.log(linha("linhas envolvidas", s.email.linhasEnvolvidas, fmtPct(s.email.linhasPct)));

  console.log(`\n  Telefone (normalizado: ${s.telefone.normalizacao}):`);
  console.log(linha("clientes com telefone", s.telefone.clientesComTelefone));
  console.log(linha("com 8+ dígitos (comparáveis)", s.telefone.comparaveis));
  console.log(linha("telefones em mais de 1 cliente", s.telefone.valoresRepetidos));
  console.log(
    linha("linhas envolvidas", s.telefone.linhasEnvolvidas, fmtPct(s.telefone.linhasPct)),
  );

  console.log("\n  Telefone por últimos 8 dígitos (sinal MAIS FRACO — teto, não resposta):");
  console.log(linha("chaves em mais de 1 cliente", s.telefoneUltimos8.valoresRepetidos));
  console.log(
    linha(
      "linhas envolvidas",
      s.telefoneUltimos8.linhasEnvolvidas,
      fmtPct(s.telefoneUltimos8.linhasPct),
    ),
  );
  console.log(`\n${nota(s.telefoneUltimos8.observacao)}`);

  /* ── 9 ─────────────────────────────────────────────────────────────── */
  const f = await lerFlagRbacEnforcement(prisma);
  console.log(titulo(9, `Flag ${f.chave}`));
  console.log(linha("valor efetivo (helper da aplicação)", f.ligado ? "ON" : "OFF"));
  console.log(
    linha(
      "linha na tabela Config",
      f.valorNaConfigDb !== null ? `presente (value="${f.valorNaConfigDb}")` : "ausente",
    ),
  );
  console.log(linha("variável de ambiente", f.envDefinido ? "definida" : "não definida"));
  console.log(linha("origem do valor efetivo", f.origem));
  console.log(`\n${nota(f.precedencia)}`);

  console.log(`\n${"═".repeat(72)}`);
  console.log("Fim. Nenhuma escrita foi feita.");
  console.log("═".repeat(72));
}

main()
  .catch((e) => {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`\nERRO: ${msg}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    // Fecha o pool mesmo em caminho de erro, para o processo não ficar pendurado.
    // `clienteAberto` fica null quando a falha foi ANTES do import dinâmico
    // (ex.: DATABASE_URL ausente) — aí não há nada para desconectar.
    await clienteAberto?.$disconnect().catch(() => {});
  });
