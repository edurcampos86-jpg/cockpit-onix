/**
 * Métricas de IDENTIDADE do cliente — coleta SOMENTE LEITURA.
 *
 * Fonte única de verdade para `scripts/recon-identidade.ts` (terminal) e
 * `GET /api/backoffice/recon-identidade` (navegador). A semântica de cada
 * número mora AQUI; os dois consumidores só formatam.
 *
 * Mede se `ClienteBackoffice.cpfCnpj` tem cobertura para virar a âncora que
 * liga a mesma pessoa às várias empresas do grupo (Onix Co), e quão ruidosos
 * são os sinais fracos (e-mail, telefone) que teriam de cobrir o resto.
 *
 * Contexto: `ClienteBackoffice` não tem UNIQUE nenhum — nem em `numeroConta`,
 * nem em `cpfCnpj` (prisma/schema.prisma:792-797, só @@index).
 *
 * ── GARANTIA DE SEGURANÇA ────────────────────────────────────────────────
 * Este módulo NÃO escreve. Só `count`, `GROUP BY` e `SELECT`; nenhuma chamada
 * a create/update/upsert/delete/executeRaw existe aqui. Se você estiver
 * editando este arquivo e precisar de um write, o lugar certo é outro módulo
 * — este é seguro de chamar contra produção por construção.
 *
 * ── NENHUM DADO PESSOAL NA SAÍDA ─────────────────────────────────────────
 * Só agregados. Duplicatas saem como CONTAGEM de valores repetidos, nunca
 * como os valores. Nenhum CPF, e-mail, telefone, nome ou id de cliente
 * atravessa a fronteira deste módulo.
 *
 * ── POR QUE O CLIENT VEM POR PARÂMETRO ───────────────────────────────────
 * Nada aqui importa `@/lib/prisma` estaticamente. O script precisa checar
 * DATABASE_URL ANTES de o cliente ser construído (src/lib/prisma.ts:10 usa
 * `process.env.DATABASE_URL!` no import), e um import estático nosso quebraria
 * esse guard por tabela. A rota passa o singleton normal.
 */
import type { PrismaClient } from "@/generated/prisma/client";

/**
 * O contrato mínimo que a coleta usa. Aceita o `PrismaClient` inteiro, mas não
 * exige — mantém o módulo testável e deixa explícito que só leitura é usada.
 */
export type ClienteLeitura = Pick<PrismaClient, "$queryRaw" | "$transaction" | "config">;

/* ──────────────────────────────────────────────────────────────────────────
 * NOTA SOBRE AS REGEX NO SQL
 *
 * Todas usam a classe `[^0-9]`, nunca `\D`. Motivo: em template literal do
 * JavaScript, "\D" NÃO é escape reconhecido e o backslash é engolido — a
 * string que chegaria ao Postgres seria "D", e o regexp_replace passaria a
 * apagar a letra D em vez de apagar os não-dígitos, em silêncio e com
 * resultado plausível. `[^0-9]` não tem backslash e não tem essa armadilha.
 *
 * NOTA SOBRE OS CASTS ::int
 *
 * Todo agregado é castado no SQL de propósito: `count()` e `sum()` voltam como
 * bigint do Postgres, e bigint quebra na serialização JS (e em JSON.stringify,
 * o que derrubaria a rota).
 * ────────────────────────────────────────────────────────────────────── */

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
 * Formato público (o mesmo que a rota serializa e o script imprime)
 * ────────────────────────────────────────────────────────────────────── */

/** Percentual já calculado, para script e rota nunca divergirem na conta. */
export type Pct = number | null;

export type MetricasIdentidade = {
  /** 1 — Total de linhas em ClienteBackoffice. */
  totalClientes: { item: 1; total: number };

  /** 2 — Cobertura de cpfCnpj. Nulo, vazio e preenchido são estados distintos. */
  coberturaCpfCnpj: {
    item: 2;
    preenchido: number;
    nulo: number;
    vazio: number;
    coberturaPct: Pct;
    nuloPct: Pct;
    vazioPct: Pct;
  };

  /** 3 — assessorCge ausente. Sob escopo restrito, cliente sem CGE some da lista. */
  assessorCgeAusente: {
    item: 3;
    nulo: number;
    vazio: number;
    nuloPct: Pct;
    vazioPct: Pct;
    observacao: string;
  };

  /** 4 — Cruzamento: sem dono (CGE) E sem identidade (documento). */
  semCgeESemDocumento: {
    item: 4;
    ambosNulos: number;
    ambosAusentes: number;
    ambosNulosPct: Pct;
    ambosAusentesPct: Pct;
    observacao: string;
  };

  /** 5 — Distribuição por tipoConta. */
  distribuicaoTipoConta: {
    item: 5;
    pf: number;
    pj: number;
    outros: number;
    vazio: number;
    nulo: number;
    pfPct: Pct;
    pjPct: Pct;
    outrosPct: Pct;
  };

  /** 6 — Tamanho do documento após remover máscara. Percentuais sobre os preenchidos. */
  tamanhoDocumento: {
    item: 6;
    onzeDigitos: number;
    quatorzeDigitos: number;
    outroTamanho: number;
    onzeDigitosPct: Pct;
    quatorzeDigitosPct: Pct;
    outroTamanhoPct: Pct;
    baseDoPercentual: "preenchidos";
    /** Os três baldes têm de somar os preenchidos. false ⇒ trate os números como suspeitos. */
    consistente: boolean;
  };

  /** 7 — Duplicatas de cpfCnpj, em duas leituras. */
  duplicatasCpfCnpj: {
    item: 7;
    porDigitos: { valoresRepetidos: number; linhasEnvolvidas: number; linhasPct: Pct };
    porValorCru: { valoresRepetidos: number; linhasEnvolvidas: number; linhasPct: Pct };
    observacao: string;
  };

  /**
   * 8 — Sinais fracos para união CPF↔CNPJ. TETO, não número final.
   *
   * `natureza: "estimativa"` é parte do contrato: quem consome não deve tratar
   * estes valores como quantidade de pessoas unificáveis. Duas contas legítimas
   * podem dividir e-mail (casal, empresa) ou telefone sem serem a mesma pessoa.
   */
  sinaisFracosUniao: {
    item: 8;
    natureza: "estimativa";
    email: {
      clientesComEmail: number;
      valoresRepetidos: number;
      linhasEnvolvidas: number;
      linhasPct: Pct;
      normalizacao: string;
    };
    telefone: {
      clientesComTelefone: number;
      comparaveis: number;
      valoresRepetidos: number;
      linhasEnvolvidas: number;
      linhasPct: Pct;
      normalizacao: string;
    };
    telefoneUltimos8: {
      valoresRepetidos: number;
      linhasEnvolvidas: number;
      linhasPct: Pct;
      natureza: "estimativa";
      observacao: string;
    };
    observacao: string;
  };

  /** 9 — Flag RBAC_ENFORCEMENT: valor efetivo + procedência. */
  flagRbacEnforcement: {
    item: 9;
    chave: string;
    ligado: boolean;
    origem: "config-db" | "env" | "ausente";
    valorNaConfigDb: string | null;
    envDefinido: boolean;
    precedencia: string;
  };
};

/* ──────────────────────────────────────────────────────────────────────────
 * Helpers
 * ────────────────────────────────────────────────────────────────────── */

/** Percentual sobre um total, com guarda de divisão por zero. `null` = n/a. */
export function pct(parte: number, total: number): Pct {
  if (total <= 0) return null;
  return Number(((parte / total) * 100).toFixed(1));
}

/* ──────────────────────────────────────────────────────────────────────────
 * Coleta
 * ────────────────────────────────────────────────────────────────────── */

/**
 * Roda os quatro agregados e devolve as métricas 1–8 já calculadas.
 *
 * Os quatro rodam dentro de UMA transação para que os números sejam mutuamente
 * consistentes. Sem isso, contra um banco vivo (import ou sync do BTG rodando
 * no meio), o total do item 1 poderia não fechar com os baldes do item 2 — e a
 * inconsistência apareceria como "bug". Transação de leitura pura.
 */
export async function coletarMetricasIdentidade(
  db: ClienteLeitura,
): Promise<Omit<MetricasIdentidade, "flagRbacEnforcement">> {
  const [perfilRows, dupDocRows, dupEmailRows, dupTelefoneRows] = await db.$transaction([
    db.$queryRaw<PerfilRow[]>`
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
    db.$queryRaw<DupDocRow[]>`
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
    db.$queryRaw<DupEmailRow[]>`
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
    db.$queryRaw<DupTelefoneRow[]>`
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

  const total = p.total;
  // Base dos percentuais do item 6 são os PREENCHIDOS, não o total.
  const basePreenchidos = p.cpf_preenchido;

  return {
    totalClientes: { item: 1, total },

    coberturaCpfCnpj: {
      item: 2,
      preenchido: p.cpf_preenchido,
      nulo: p.cpf_nulo,
      vazio: p.cpf_vazio,
      coberturaPct: pct(p.cpf_preenchido, total),
      nuloPct: pct(p.cpf_nulo, total),
      vazioPct: pct(p.cpf_vazio, total),
    },

    assessorCgeAusente: {
      item: 3,
      nulo: p.cge_nulo,
      vazio: p.cge_vazio,
      nuloPct: pct(p.cge_nulo, total),
      vazioPct: pct(p.cge_vazio, total),
      observacao:
        "Com RBAC_ENFORCEMENT ON e escopo restrito, cliente sem CGE não casa " +
        "nenhuma carteira e some da lista (src/lib/rbac.ts:131).",
    },

    semCgeESemDocumento: {
      item: 4,
      ambosNulos: p.cge_nulo_e_cpf_nulo,
      ambosAusentes: p.cge_e_cpf_ausentes,
      ambosNulosPct: pct(p.cge_nulo_e_cpf_nulo, total),
      ambosAusentesPct: pct(p.cge_e_cpf_ausentes, total),
      observacao:
        "Linhas sem dono (CGE) e sem identidade (documento): invisíveis sob " +
        "escopo restrito e impossíveis de ligar a outra empresa.",
    },

    distribuicaoTipoConta: {
      item: 5,
      pf: p.tc_pf,
      pj: p.tc_pj,
      outros: p.tc_outros,
      vazio: p.tc_vazio,
      nulo: p.tc_nulo,
      pfPct: pct(p.tc_pf, total),
      pjPct: pct(p.tc_pj, total),
      outrosPct: pct(p.tc_outros, total),
    },

    tamanhoDocumento: {
      item: 6,
      onzeDigitos: p.doc_11,
      quatorzeDigitos: p.doc_14,
      outroTamanho: p.doc_outro_tamanho,
      onzeDigitosPct: pct(p.doc_11, basePreenchidos),
      quatorzeDigitosPct: pct(p.doc_14, basePreenchidos),
      outroTamanhoPct: pct(p.doc_outro_tamanho, basePreenchidos),
      baseDoPercentual: "preenchidos",
      // Conferência: os três baldes têm de somar exatamente os preenchidos. Se
      // não somarem, alguma premissa deste módulo está errada — melhor gritar
      // do que deixar alguém decidir modelagem em cima de número furado.
      consistente: p.doc_11 + p.doc_14 + p.doc_outro_tamanho === basePreenchidos,
    },

    duplicatasCpfCnpj: {
      item: 7,
      porDigitos: {
        valoresRepetidos: doc.valores_norm,
        linhasEnvolvidas: doc.linhas_norm,
        linhasPct: pct(doc.linhas_norm, total),
      },
      porValorCru: {
        valoresRepetidos: doc.valores_bruto,
        linhasEnvolvidas: doc.linhas_bruto,
        linhasPct: pct(doc.linhas_bruto, total),
      },
      observacao:
        "A diferença entre as duas leituras é duplicata que só existe por " +
        "formatação — some sozinha se o campo for normalizado na gravação.",
    },

    sinaisFracosUniao: {
      item: 8,
      natureza: "estimativa",
      email: {
        clientesComEmail: mail.preenchidos,
        valoresRepetidos: mail.valores,
        linhasEnvolvidas: mail.linhas,
        linhasPct: pct(mail.linhas, total),
        normalizacao: "lower + trim",
      },
      telefone: {
        clientesComTelefone: tel.preenchidos,
        comparaveis: tel.com_8_ou_mais_digitos,
        valoresRepetidos: tel.valores_full,
        linhasEnvolvidas: tel.linhas_full,
        linhasPct: pct(tel.linhas_full, total),
        normalizacao: "só dígitos",
      },
      telefoneUltimos8: {
        valoresRepetidos: tel.valores_8,
        linhasEnvolvidas: tel.linhas_8,
        linhasPct: pct(tel.linhas_8, total),
        natureza: "estimativa",
        observacao:
          "Chave de 8 dígitos ignora DDI/DDD: pega o mesmo número gravado com " +
          "e sem '55', mas também colide entre DDDs diferentes. A distância " +
          "para o número por dígitos completos é a margem de dúvida.",
      },
      observacao:
        "TETO, não número final. E-mail e telefone repetidos NÃO provam mesma " +
        "pessoa: casal, empresa e conta compartilhada dividem contato " +
        "legitimamente. Serve para dimensionar conciliação manual, não para " +
        "unificar automaticamente.",
    },
  };
}

/**
 * Item 9 — flag RBAC_ENFORCEMENT: valor efetivo + procedência.
 *
 * O valor efetivo vem do MESMO helper que a aplicação usa
 * (`rbacEnforcementHabilitado`), não de leitura direta da tabela, para
 * respeitar o fallback DB -> env de `getConfig` (src/lib/config-db.ts:19-32).
 *
 * A procedência existe porque `getConfig` cai para o env em silêncio: sem ela,
 * um valor vindo do ambiente pareceria vir da tabela `Config` e a flag seria
 * alterada no lugar errado.
 *
 * O import de `@/lib/rbac` é DINÂMICO de propósito — ele arrasta
 * `@/lib/prisma`, e um import estático aqui quebraria o guard de DATABASE_URL
 * do script (ver nota no topo do arquivo).
 */
export async function lerFlagRbacEnforcement(
  db: ClienteLeitura,
): Promise<MetricasIdentidade["flagRbacEnforcement"]> {
  const { rbacEnforcementHabilitado, RBAC_ENFORCEMENT_FLAG } = await import("@/lib/rbac");

  const ligado = await rbacEnforcementHabilitado();

  const linhaConfig = await db.config.findUnique({
    where: { key: RBAC_ENFORCEMENT_FLAG },
    select: { value: true },
  });
  const envDefinido = typeof process.env[RBAC_ENFORCEMENT_FLAG] === "string";

  // Mesma precedência de getConfig: linha na Config com valor não-vazio ganha;
  // env é fallback. Reproduzida aqui só para ROTULAR a origem — o valor
  // efetivo continua sendo o que o helper devolveu.
  const origem: "config-db" | "env" | "ausente" = linhaConfig?.value
    ? "config-db"
    : envDefinido
      ? "env"
      : "ausente";

  return {
    item: 9,
    chave: RBAC_ENFORCEMENT_FLAG,
    ligado,
    origem,
    valorNaConfigDb: linhaConfig?.value ?? null,
    envDefinido,
    precedencia:
      "Tabela Config primeiro, variável de ambiente como fallback " +
      "(src/lib/config-db.ts:19-32). Aceita: 1, true, on, yes, sim.",
  };
}

/** Coleta completa (itens 1–9). É o que a rota serializa. */
export async function coletarReconIdentidade(
  db: ClienteLeitura,
): Promise<MetricasIdentidade> {
  const metricas = await coletarMetricasIdentidade(db);
  const flagRbacEnforcement = await lerFlagRbacEnforcement(db);
  return { ...metricas, flagRbacEnforcement };
}
