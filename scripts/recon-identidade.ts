/**
 * Recon de IDENTIDADE do cliente — SOMENTE LEITURA.
 *
 * Mede o que hoje é suposição: se `cpfCnpj` tem cobertura suficiente para
 * virar a âncora que liga a mesma pessoa às várias empresas do grupo (Onix
 * Co), e quão ruidosos são os sinais fracos (e-mail, telefone) que teriam de
 * cobrir o resto.
 *
 * Por que isso importa agora: `ClienteBackoffice` não tem UNIQUE nenhum —
 * nem em `numeroConta`, nem em `cpfCnpj` (prisma/schema.prisma:792-797, só
 * @@index). Decidir a modelagem de pessoa-titular sem esses números é chutar.
 *
 * ── GARANTIA DE SEGURANÇA ────────────────────────────────────────────────
 * Este script NÃO escreve. Só usa `count`, `GROUP BY` e `SELECT`; nenhuma
 * chamada a create/update/upsert/delete/executeRaw existe aqui. Se você
 * estiver editando este arquivo e precisar de um write, o lugar certo é
 * outro script — este é seguro de rodar contra produção por construção.
 *
 * ── NENHUM DADO PESSOAL NA SAÍDA ─────────────────────────────────────────
 * Só agregados. Nenhum CPF, e-mail, telefone ou nome é impresso — nem em
 * amostra, nem em mensagem de erro. As duplicatas saem como CONTAGEM de
 * valores repetidos, nunca como os valores.
 *
 * Como rodar:
 *   tsx scripts/recon-identidade.ts
 */
/*
 * `dotenv/config` é o ÚNICO import estático da aplicação aqui, e é de
 * propósito. O ESM avalia todo import antes do corpo do módulo — se
 * `../src/lib/prisma` fosse estático, ele construiria o cliente com
 * `process.env.DATABASE_URL!` (src/lib/prisma.ts:10) ANTES de qualquer
 * checagem nossa, e a falha por variável ausente sairia como erro interno do
 * driver em vez da mensagem clara que este script promete. Os imports da
 * aplicação são dinâmicos, dentro de main(), depois do guard.
 */
import "dotenv/config";

/* ──────────────────────────────────────────────────────────────────────────
 * Formatação
 * ────────────────────────────────────────────────────────────────────── */

/** Percentual sobre um total, com guarda de divisão por zero. */
function pct(parte: number, total: number): string {
  if (total <= 0) return "n/a";
  return `${((parte / total) * 100).toFixed(1)}%`;
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
 * Tipos das linhas cruas
 *
 * Todo agregado é castado para ::int no SQL de propósito: `count()` e `sum()`
 * voltam como bigint do Postgres, e bigint quebra na serialização JS. O cast
 * resolve na origem em vez de exigir conversão em cada campo aqui.
 * ────────────────────────────────────────────────────────────────────── */

/**
 * Referência ao cliente para o `finally` de baixo poder desconectar mesmo
 * quando main() morre no meio. Só precisa do contrato de desconexão — tipar
 * como o PrismaClient inteiro obrigaria a importar o tipo estaticamente, que é
 * exatamente o que a nota do topo evita.
 */
let clienteAberto: { $disconnect: () => Promise<void> } | null = null;

type PerfilRow = {
  total: number;
  cpf_nulo: number;
  cpf_vazio: number;
  cpf_preenchido: number;
  cge_nulo: number;
  cge_vazio: number;
  cge_nulo_e_cpf_nulo: number;
  cge_e_cpf_ausentes: number;
  tc_pf: number;
  tc_pj: number;
  tc_nulo: number;
  tc_vazio: number;
  tc_outros: number;
  doc_11: number;
  doc_14: number;
  doc_outro_tamanho: number;
};

type DupDocRow = {
  valores_norm: number;
  linhas_norm: number;
  valores_bruto: number;
  linhas_bruto: number;
};

type DupEmailRow = {
  preenchidos: number;
  valores: number;
  linhas: number;
};

type DupTelefoneRow = {
  preenchidos: number;
  com_8_ou_mais_digitos: number;
  valores_full: number;
  linhas_full: number;
  valores_8: number;
  linhas_8: number;
};

/* ──────────────────────────────────────────────────────────────────────────
 * NOTA SOBRE AS REGEX NO SQL
 *
 * Todas usam a classe `[^0-9]`, nunca `\D`. Motivo: em template literal do
 * JavaScript, "\D" NÃO é escape reconhecido e o backslash é engolido — a
 * string que chegaria ao Postgres seria "D", e o regexp_replace passaria a
 * apagar a letra D em vez de apagar os não-dígitos, em silêncio e com
 * resultado plausível. `[^0-9]` não tem backslash e não tem essa armadilha.
 * ────────────────────────────────────────────────────────────────────── */

async function main(): Promise<void> {
  console.log("═".repeat(72));
  console.log("RECON DE IDENTIDADE DO CLIENTE — somente leitura");
  console.log("═".repeat(72));

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL não está definida. Rode a partir da raiz do projeto, com o .env " +
        "carregado (o script já faz `import \"dotenv/config\"`), ou exporte a variável na shell.",
    );
  }

  // Exigido ANTES de qualquer query: você precisa saber contra qual banco isto
  // vai rodar antes de ver um número sequer.
  console.log(`\nDestino: ${descreverDestino(url)}`);

  // Só agora carrega o cliente da aplicação — ver nota no topo do arquivo.
  const { prisma } = await import("../src/lib/prisma");
  const { rbacEnforcementHabilitado, RBAC_ENFORCEMENT_FLAG } = await import("../src/lib/rbac");
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

  /* Os quatro agregados rodam dentro de UMA transação para que os números
   * sejam mutuamente consistentes. Sem isso, contra um banco vivo (import ou
   * sync do BTG rodando no meio), o total do item 1 poderia não fechar com os
   * baldes do item 2 — e a inconsistência apareceria como "bug do script".
   * Transação de leitura pura: não abre caminho de escrita. */
  const [perfilRows, dupDocRows, dupEmailRows, dupTelefoneRows] = await prisma.$transaction([
    prisma.$queryRaw<PerfilRow[]>`
      SELECT
        count(*)::int AS total,

        -- Cobertura de cpfCnpj: nulo, string vazia (ou só espaços) e preenchido
        -- são três estados distintos. Colapsá-los esconderia lixo de import.
        count(*) FILTER (WHERE "cpfCnpj" IS NULL)::int AS cpf_nulo,
        count(*) FILTER (WHERE "cpfCnpj" IS NOT NULL AND btrim("cpfCnpj") = '')::int AS cpf_vazio,
        count(*) FILTER (WHERE "cpfCnpj" IS NOT NULL AND btrim("cpfCnpj") <> '')::int AS cpf_preenchido,

        -- assessorCge nulo é o que torna o cliente invisível sob escopo
        -- restrito (src/lib/rbac.ts:131 exige assessorCge !== null).
        count(*) FILTER (WHERE "assessorCge" IS NULL)::int AS cge_nulo,
        count(*) FILTER (WHERE "assessorCge" IS NOT NULL AND btrim("assessorCge") = '')::int AS cge_vazio,

        -- Cruzamento estrito (ambos NULL) e frouxo (ambos ausentes, contando
        -- string vazia). O segundo é o número honesto: "" e NULL doem igual.
        count(*) FILTER (WHERE "assessorCge" IS NULL AND "cpfCnpj" IS NULL)::int AS cge_nulo_e_cpf_nulo,
        count(*) FILTER (
          WHERE ("assessorCge" IS NULL OR btrim("assessorCge") = '')
            AND ("cpfCnpj" IS NULL OR btrim("cpfCnpj") = '')
        )::int AS cge_e_cpf_ausentes,

        -- tipoConta: normalizado para comparar (o import faz toUpperCase, mas
        -- linhas antigas podem ter escapado).
        count(*) FILTER (WHERE upper(btrim(coalesce("tipoConta", ''))) = 'PF')::int AS tc_pf,
        count(*) FILTER (WHERE upper(btrim(coalesce("tipoConta", ''))) = 'PJ')::int AS tc_pj,
        count(*) FILTER (WHERE "tipoConta" IS NULL)::int AS tc_nulo,
        count(*) FILTER (WHERE "tipoConta" IS NOT NULL AND btrim("tipoConta") = '')::int AS tc_vazio,
        count(*) FILTER (
          WHERE "tipoConta" IS NOT NULL
            AND btrim("tipoConta") <> ''
            AND upper(btrim("tipoConta")) NOT IN ('PF', 'PJ')
        )::int AS tc_outros,

        -- Tamanho do documento APÓS remover máscara. 11 = CPF, 14 = CNPJ;
        -- qualquer outro tamanho (incluindo zero dígitos, ex.: "N/A", "-")
        -- é valor que nunca vai casar como chave de identidade.
        count(*) FILTER (
          WHERE length(regexp_replace(coalesce("cpfCnpj", ''), '[^0-9]', '', 'g')) = 11
        )::int AS doc_11,
        count(*) FILTER (
          WHERE length(regexp_replace(coalesce("cpfCnpj", ''), '[^0-9]', '', 'g')) = 14
        )::int AS doc_14,
        count(*) FILTER (
          WHERE "cpfCnpj" IS NOT NULL
            AND btrim("cpfCnpj") <> ''
            AND length(regexp_replace("cpfCnpj", '[^0-9]', '', 'g')) NOT IN (11, 14)
        )::int AS doc_outro_tamanho
      FROM "ClienteBackoffice"
    `,

    /* Duplicatas de documento, em duas leituras:
     *  - NORMALIZADA (só dígitos) — é a que importa, porque é assim que uma
     *    chave de identidade compararia. "097.146.005-10" e "09714600510"
     *    são a MESMA pessoa e hoje convivem como valores distintos.
     *  - BRUTA (valor como está no banco) — a diferença entre as duas mede
     *    quanto do problema é só formatação. */
    prisma.$queryRaw<DupDocRow[]>`
      WITH base AS (
        SELECT
          btrim("cpfCnpj") AS bruto,
          regexp_replace("cpfCnpj", '[^0-9]', '', 'g') AS doc
        FROM "ClienteBackoffice"
        WHERE "cpfCnpj" IS NOT NULL AND btrim("cpfCnpj") <> ''
      ),
      dup_norm AS (
        SELECT doc, count(*) AS n
        FROM base
        WHERE doc <> ''
        GROUP BY doc
        HAVING count(*) > 1
      ),
      dup_bruto AS (
        SELECT bruto, count(*) AS n
        FROM base
        GROUP BY bruto
        HAVING count(*) > 1
      )
      SELECT
        (SELECT count(*) FROM dup_norm)::int AS valores_norm,
        (SELECT coalesce(sum(n), 0) FROM dup_norm)::int AS linhas_norm,
        (SELECT count(*) FROM dup_bruto)::int AS valores_bruto,
        (SELECT coalesce(sum(n), 0) FROM dup_bruto)::int AS linhas_bruto
    `,

    /* E-mail repetido. Normalizado (lower + trim) porque o campo NÃO é
     * normalizado na gravação — clean() em api/backoffice/clientes/route.ts:37
     * só faz trim(). Sem o lower() aqui, "Joao@x.com" e "joao@x.com" contariam
     * como pessoas diferentes e o sinal apareceria mais fraco do que é. */
    prisma.$queryRaw<DupEmailRow[]>`
      WITH base AS (
        SELECT lower(btrim("email")) AS chave
        FROM "ClienteBackoffice"
        WHERE "email" IS NOT NULL AND btrim("email") <> ''
      ),
      dup AS (
        SELECT chave, count(*) AS n
        FROM base
        GROUP BY chave
        HAVING count(*) > 1
      )
      SELECT
        (SELECT count(*) FROM base)::int AS preenchidos,
        (SELECT count(*) FROM dup)::int AS valores,
        (SELECT coalesce(sum(n), 0) FROM dup)::int AS linhas
    `,

    /* Telefone repetido, também em duas leituras:
     *  - DÍGITOS COMPLETOS — chave exata.
     *  - ÚLTIMOS 8 DÍGITOS — chave frouxa, que cobre o caso real de o mesmo
     *    número estar gravado ora com DDI ("5571..."), ora sem ("71..."),
     *    porque a gravação não normaliza (normalizarTelefoneZapi só roda no
     *    envio, src/lib/integrations/telefone.ts:29). É sinal MAIS FRACO:
     *    8 dígitos colidem entre DDDs diferentes. Serve de teto, não de
     *    resposta — a diferença entre os dois números é a margem de dúvida. */
    prisma.$queryRaw<DupTelefoneRow[]>`
      WITH base AS (
        SELECT regexp_replace("telefone", '[^0-9]', '', 'g') AS d
        FROM "ClienteBackoffice"
        WHERE "telefone" IS NOT NULL AND btrim("telefone") <> ''
      ),
      com_digitos AS (
        SELECT d, right(d, 8) AS final8
        FROM base
        WHERE length(d) >= 8
      ),
      dup_full AS (
        SELECT d, count(*) AS n FROM com_digitos GROUP BY d HAVING count(*) > 1
      ),
      dup_8 AS (
        SELECT final8, count(*) AS n FROM com_digitos GROUP BY final8 HAVING count(*) > 1
      )
      SELECT
        (SELECT count(*) FROM base)::int AS preenchidos,
        (SELECT count(*) FROM com_digitos)::int AS com_8_ou_mais_digitos,
        (SELECT count(*) FROM dup_full)::int AS valores_full,
        (SELECT coalesce(sum(n), 0) FROM dup_full)::int AS linhas_full,
        (SELECT count(*) FROM dup_8)::int AS valores_8,
        (SELECT coalesce(sum(n), 0) FROM dup_8)::int AS linhas_8
    `,
  ]);

  const p = perfilRows[0];
  const doc = dupDocRows[0];
  const mail = dupEmailRows[0];
  const tel = dupTelefoneRows[0];

  /* ── 1 ─────────────────────────────────────────────────────────────── */
  console.log(titulo(1, "Total de ClienteBackoffice"));
  console.log(linha("linhas", p.total));

  if (p.total === 0) {
    console.log(
      "\n  Tabela vazia — os itens seguintes não têm o que medir. " +
        "Confira se o destino acima é o banco que você queria.",
    );
    return;
  }

  /* ── 2 ─────────────────────────────────────────────────────────────── */
  console.log(titulo(2, "Cobertura de cpfCnpj"));
  console.log(linha("preenchido", p.cpf_preenchido, pct(p.cpf_preenchido, p.total)));
  console.log(linha("nulo", p.cpf_nulo, pct(p.cpf_nulo, p.total)));
  console.log(linha("string vazia (ou só espaços)", p.cpf_vazio, pct(p.cpf_vazio, p.total)));
  console.log(`\n  Cobertura efetiva: ${pct(p.cpf_preenchido, p.total)} do total.`);

  /* ── 3 ─────────────────────────────────────────────────────────────── */
  console.log(titulo(3, "assessorCge ausente"));
  console.log(linha("nulo", p.cge_nulo, pct(p.cge_nulo, p.total)));
  console.log(linha("string vazia (ou só espaços)", p.cge_vazio, pct(p.cge_vazio, p.total)));
  console.log(
    "\n  Relevância: com RBAC_ENFORCEMENT ON e escopo restrito, cliente sem CGE\n" +
      "  não casa nenhuma carteira e some da lista — src/lib/rbac.ts:131.",
  );

  /* ── 4 ─────────────────────────────────────────────────────────────── */
  console.log(titulo(4, "Cruzamento: sem assessorCge E sem cpfCnpj"));
  console.log(
    linha("ambos NULL", p.cge_nulo_e_cpf_nulo, pct(p.cge_nulo_e_cpf_nulo, p.total)),
  );
  console.log(
    linha(
      "ambos ausentes (NULL ou vazio)",
      p.cge_e_cpf_ausentes,
      pct(p.cge_e_cpf_ausentes, p.total),
    ),
  );
  console.log(
    "\n  Estas linhas não têm nem dono (CGE) nem identidade (documento):\n" +
      "  invisíveis sob escopo restrito e impossíveis de ligar a outra empresa.",
  );

  /* ── 5 ─────────────────────────────────────────────────────────────── */
  console.log(titulo(5, "Distribuição por tipoConta"));
  console.log(linha("PF", p.tc_pf, pct(p.tc_pf, p.total)));
  console.log(linha("PJ", p.tc_pj, pct(p.tc_pj, p.total)));
  console.log(linha("outros (valor não-PF/PJ)", p.tc_outros, pct(p.tc_outros, p.total)));
  console.log(linha("string vazia", p.tc_vazio, pct(p.tc_vazio, p.total)));
  console.log(linha("nulo", p.tc_nulo, pct(p.tc_nulo, p.total)));

  /* ── 6 ─────────────────────────────────────────────────────────────── */
  console.log(titulo(6, "Tamanho do documento (após remover máscara)"));
  console.log(linha("11 dígitos (CPF)", p.doc_11, pct(p.doc_11, p.cpf_preenchido || 1)));
  console.log(linha("14 dígitos (CNPJ)", p.doc_14, pct(p.doc_14, p.cpf_preenchido || 1)));
  console.log(
    linha(
      "outro tamanho (inclui 0 dígitos)",
      p.doc_outro_tamanho,
      pct(p.doc_outro_tamanho, p.cpf_preenchido || 1),
    ),
  );
  console.log("  (percentuais sobre os preenchidos, não sobre o total)");

  // Conferência: os três baldes têm de somar exatamente os preenchidos. Se não
  // somarem, alguma premissa deste script está errada — melhor gritar do que
  // deixar você tomar decisão de modelagem em cima de número furado.
  const somaDoc = p.doc_11 + p.doc_14 + p.doc_outro_tamanho;
  if (somaDoc !== p.cpf_preenchido) {
    console.log(
      `\n  ATENÇÃO: soma dos baldes (${somaDoc}) != preenchidos (${p.cpf_preenchido}). ` +
        "Trate os números deste item como suspeitos.",
    );
  }

  /* ── 7 ─────────────────────────────────────────────────────────────── */
  console.log(titulo(7, "Duplicatas de cpfCnpj"));
  console.log("  Por dígitos (ignorando máscara) — a leitura que importa:");
  console.log(linha("valores repetidos", doc.valores_norm));
  console.log(linha("linhas envolvidas", doc.linhas_norm, pct(doc.linhas_norm, p.total)));
  console.log("\n  Pelo valor cru gravado:");
  console.log(linha("valores repetidos", doc.valores_bruto));
  console.log(linha("linhas envolvidas", doc.linhas_bruto, pct(doc.linhas_bruto, p.total)));
  console.log(
    "\n  A diferença entre as duas leituras é duplicata que só existe por\n" +
      "  formatação — some sozinha se o campo for normalizado na gravação.",
  );

  /* ── 8 ─────────────────────────────────────────────────────────────── */
  console.log(titulo(8, "Sinais fracos para união (e-mail e telefone)"));
  console.log("  E-mail (normalizado: lower + trim):");
  console.log(linha("clientes com e-mail", mail.preenchidos, pct(mail.preenchidos, p.total)));
  console.log(linha("e-mails em mais de 1 cliente", mail.valores));
  console.log(linha("linhas envolvidas", mail.linhas, pct(mail.linhas, p.total)));

  console.log("\n  Telefone (normalizado: só dígitos):");
  console.log(linha("clientes com telefone", tel.preenchidos, pct(tel.preenchidos, p.total)));
  console.log(linha("com 8+ dígitos (comparáveis)", tel.com_8_ou_mais_digitos));
  console.log(linha("telefones em mais de 1 cliente", tel.valores_full));
  console.log(linha("linhas envolvidas", tel.linhas_full, pct(tel.linhas_full, p.total)));

  console.log("\n  Telefone por últimos 8 dígitos (sinal MAIS FRACO — teto, não resposta):");
  console.log(linha("chaves em mais de 1 cliente", tel.valores_8));
  console.log(linha("linhas envolvidas", tel.linhas_8, pct(tel.linhas_8, p.total)));
  console.log(
    "\n  A chave de 8 dígitos ignora DDI/DDD: pega o mesmo número gravado com e\n" +
      "  sem '55', mas também colide entre DDDs diferentes. A distância entre os\n" +
      "  dois números acima é a margem de dúvida da união por telefone.",
  );

  /* ── 9 ─────────────────────────────────────────────────────────────── */
  console.log(titulo(9, `Flag ${RBAC_ENFORCEMENT_FLAG}`));

  // Valor efetivo pelo MESMO helper que a aplicação usa — inclusive o fallback
  // DB -> env de getConfig() (src/lib/config-db.ts:19). Ler a tabela na mão
  // aqui daria um resultado que a aplicação não necessariamente enxerga.
  const ligado = await rbacEnforcementHabilitado();

  // Diagnóstico de PROCEDÊNCIA. getConfig prefere o banco e cai para o env; sem
  // isto, um valor vindo do env pareceria vir da tabela Config e você mexeria
  // no lugar errado ao tentar mudar a flag.
  const linhaConfig = await prisma.config.findUnique({
    where: { key: RBAC_ENFORCEMENT_FLAG },
    select: { value: true },
  });
  const envDefinido = typeof process.env[RBAC_ENFORCEMENT_FLAG] === "string";

  console.log(
    linha("valor efetivo (helper da aplicação)", ligado ? "ON" : "OFF"),
  );
  console.log(
    linha(
      "linha na tabela Config",
      linhaConfig ? `presente (value="${linhaConfig.value}")` : "ausente",
    ),
  );
  console.log(linha("variável de ambiente", envDefinido ? "definida" : "não definida"));
  console.log(
    "\n  Precedência: tabela Config primeiro, env como fallback\n" +
      "  (src/lib/config-db.ts:19-32). Aceita: 1, true, on, yes, sim.",
  );

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
