/**
 * Piloto de UM parceiro real, ponta a ponta — Renan, com os 4 clientes dele.
 *
 * Cria a primeira linha de cada tabela da Fase 1 de Parceiros e prova que o
 * modelo aguenta o caso concreto ANTES de existir UI:
 *
 *     Parceiro  →  AcordoComercialParceiro  →  ParceiroCliente (N clientes)
 *
 * ── POR QUE EXISTE ───────────────────────────────────────────────────────
 * Cinco tabelas estão em produção desde a Fase 1 e todas estão VAZIAS. As
 * garantias foram provadas em shadow-DB com dado sintético; o que ainda não
 * foi provado é que a modelagem serve ao caso real — que o Renan cabe em
 * `Parceiro` sem campo faltando, que o acordo dele cabe em
 * `AcordoComercialParceiro`, e que os clientes entram por `ParceiroCliente`
 * sem esbarrar na exclusividade da #310.
 *
 * Estrutura sem uso não recebe correção da realidade. Este script é o menor
 * uso possível.
 *
 * ── VÁRIOS CLIENTES, E POR ISSO TUDO-OU-NADA ─────────────────────────────
 * O piloto real não é 1 cliente, são 4 — e um lote parcialmente aplicado é
 * pior do que nenhum: ninguém sabe de cabeça quais entraram, e a segunda
 * tentativa vira adivinhação. Então TODAS as contas são resolvidas ANTES de
 * qualquer escrita; se uma só falhar, o relatório sai completo (as 4 linhas,
 * não a primeira que quebrou) e NADA é escrito.
 *
 * As três recusas continuam valendo, agora por cliente:
 *   1. `numeroConta` que casa com mais de um cliente → ABORTA (não escolhe).
 *   2. cliente com parceiro vigente DIFERENTE → ABORTA (a #310 rejeitaria).
 *   3. acordo vigente com outro percentual → NÃO sobrescreve.
 * A recusa 2 tem uma exceção que é justamente a idempotência: se o parceiro
 * vigente do cliente JÁ É este parceiro, isso não é conflito, é reexecução.
 *
 * ── DRY-RUN É O PADRÃO ───────────────────────────────────────────────────
 * Sem `--aplicar`, NADA é escrito: o script lê, resolve os clientes, monta o
 * plano e imprime, POR CLIENTE, o que faria. É o mesmo desenho de
 * `scripts/ensaio-backfill-pessoa-grupo.ts` e do backfill da #299 — dry-run
 * primeiro porque um seed que já nasce escrevendo é indistinguível de um
 * acidente.
 *
 * Com `--aplicar`, escreve dentro de UMA transação e é IDEMPOTENTE: rodar de
 * novo não duplica nada. Reexecução é o caso comum de um seed — alguém roda,
 * o terminal fecha, ninguém sabe se passou.
 *
 * ── O QUE ELE NÃO FAZ ────────────────────────────────────────────────────
 * Não cria cliente. O cliente tem de existir, e é identificado por
 * `numeroConta` — inventar um cliente para o piloto testaria o script, não a
 * modelagem.
 *
 * Não inventa o acordo. `--acordo <idDoNo>:<percentual>` é OBRIGATÓRIO e não
 * tem default: o acordo comercial é decisão do Eduardo, e um default embutido
 * viraria número gravado em produção que ninguém escolheu. Vale para a DATA
 * também — `--data-inicio` sem valor cai em `now()`, e vigência retroativa
 * precisa ser dita.
 *
 * Não toca em `Indicacao`. O texto livre de `nomeIndicado` (ex.: "Michelle e
 * Renan") permanece como está — o vínculo estruturado é complementar, não
 * substituto, e reescrever o texto apagaria o registro de como a indicação
 * chegou.
 *
 * ── VÁRIOS ACORDOS NA MESMA TRANSAÇÃO ────────────────────────────────────
 * O acordo real tem uma linha POR PRODUTO (é assim que a #318 modela). Seis
 * linhas em seis execuções seriam seis transações e seis chances de parar no
 * meio; `--acordo` é repetível para elas entrarem juntas.
 *
 * Linha com 0% É acordo, não ausência de acordo — registra que o produto foi
 * DECIDIDO como fora, em vez de deixar o silêncio parecer esquecimento.
 *
 * Como rodar:
 *   # dry-run (padrão, não escreve) — os 4 clientes do Renan
 *   DATABASE_URL="postgresql://..." npx tsx scripts/seed-parceiro-piloto.ts \
 *     --conta 009100909 004968281 037584174 008541947 \
 *     --acordo assessoria:20 --acordo seguro_resgatavel:20 \
 *     --acordo seguro_risco:20 --acordo previdencia:20 \
 *     --acordo consorcio:20 --acordo imobiliaria:0 \
 *     --data-inicio 2026-08-01
 *
 *   # aplicar de verdade (só depois de conferir o dry-run)
 *   ... --aplicar
 *
 *   # `--conta` também aceita repetição e vírgula:
 *   ... --conta 009100909 --conta 004968281,037584174
 *
 *   # se o parceiro TAMBÉM é cliente da casa, liga as duas pontas:
 *   ... --parceiro-conta <numeroConta do próprio parceiro>
 */
import "dotenv/config";
import { PrismaClient, Prisma } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  normalizarTipoParceiro,
  ehTipoParceiroConhecido,
} from "../src/lib/parceiros/vocabulario";

// Import relativo e adapter explícito seguem o padrão dos scripts existentes
// (scripts/backfill-ultima-reuniao.ts:21-25): `tsx` roda fora do resolvedor de
// paths do Next, então `@/` não resolve aqui.
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

// ── Argumentos ───────────────────────────────────────────────────────────

function arg(nome: string): string | null {
  const i = process.argv.indexOf(`--${nome}`);
  if (i === -1) return null;
  const v = process.argv[i + 1];
  return v && !v.startsWith("--") ? v : null;
}

/**
 * Argumento de LISTA. Aceita as três formas que alguém digita sem pensar:
 *
 *     --conta A B C        (vários valores depois da flag)
 *     --conta A --conta B  (flag repetida)
 *     --conta A,B          (vírgula)
 *
 * Preserva a ordem e remove duplicata — passar a mesma conta duas vezes é erro
 * de digitação, não pedido de dois vínculos (e o segundo bateria na #310).
 * Valor fica STRING: `numeroConta` tem zero à esquerda ("009100909"), e
 * converter para número apagaria o zero e não acharia o cliente.
 */
function argLista(nome: string): string[] {
  const fora: string[] = [];
  for (let i = 0; i < process.argv.length; i++) {
    if (process.argv[i] !== `--${nome}`) continue;
    for (let j = i + 1; j < process.argv.length; j++) {
      const v = process.argv[j];
      if (v.startsWith("--")) break;
      fora.push(...v.split(",").map((s) => s.trim()).filter(Boolean));
    }
  }
  return [...new Set(fora)];
}

const APLICAR = process.argv.includes("--aplicar");
const CONTAS = argLista("conta");
const NOME = arg("nome") ?? "Renan";
const TIPO_BRUTO = arg("tipo") ?? "socio";
/** Conta do PRÓPRIO parceiro, quando ele também é cliente da casa. Opcional. */
const PARCEIRO_CONTA = arg("parceiro-conta");
// Sem default, de propósito. Ver "O QUE ELE NÃO FAZ" no cabeçalho.
//
// Duas formas, porque o acordo real tem VÁRIAS linhas:
//   --acordo assessoria:20 --acordo imobiliaria:0     (repetível, ou por vírgula)
//   --produto assessoria --percentual 20              (atalho de uma linha só)
const ACORDOS_BRUTOS = argLista("acordo");
const PRODUTO_BRUTO = arg("produto");
const PERCENTUAL_BRUTO = arg("percentual");
/**
 * Início da vigência dos acordos. Sem ela, `now()`.
 *
 * Existe porque acordo comercial costuma valer de uma data COMBINADA, anterior
 * ao dia em que alguém cadastrou — e a #318 diz que vale o percentual da data
 * do fato gerador. Cadastrar tudo com `now()` faria o passado ficar sem
 * percentual nenhum.
 */
const DATA_INICIO_BRUTA = arg("data-inicio");

// ── Saída ────────────────────────────────────────────────────────────────

const linha = (s = "") => console.log(s);
const passo = (n: number, s: string) => console.log(`\n${n}. ${s}`);
const ok = (s: string) => console.log(`   ✓ ${s}`);
const aviso = (s: string) => console.log(`   ⚠ ${s}`);
const erro = (s: string) => console.log(`   ✗ ${s}`);
const plano = (s: string) => console.log(`   → ${s}`);

// ── Situação de cada conta ───────────────────────────────────────────────
//
// Resolver TODAS antes de decidir é o que torna o tudo-ou-nada possível: a
// decisão de escrever é tomada uma vez, com o lote inteiro na mão.

type Situacao =
  | { conta: string; estado: "vincular"; clienteId: string; nome: string; saldo: number }
  | { conta: string; estado: "ja_vinculado"; clienteId: string; nome: string; saldo: number }
  | { conta: string; estado: "nao_encontrada" }
  | { conta: string; estado: "ambigua"; candidatos: string }
  | { conta: string; estado: "ocupada"; nome: string; parceiroAtual: string };

type Falha = Extract<Situacao, { estado: "nao_encontrada" | "ambigua" | "ocupada" }>;
type Vincular = Extract<Situacao, { estado: "vincular" }>;

// Type predicates e não `filter(s => s.estado === ...)`: sem elas o TypeScript
// devolve `Situacao[]` e ler `s.clienteId` no lote a escrever não compila.
const ehFalha = (s: Situacao): s is Falha =>
  s.estado === "nao_encontrada" || s.estado === "ambigua" || s.estado === "ocupada";
const ehVincular = (s: Situacao): s is Vincular => s.estado === "vincular";

async function main() {
  linha("═".repeat(72));
  linha(`Piloto de parceiro — ${APLICAR ? "APLICAR (escreve)" : "DRY-RUN (não escreve)"}`);
  linha("═".repeat(72));

  // ── Validação de entrada, antes de tocar o banco ───────────────────────
  if (CONTAS.length === 0) {
    throw new Error(
      "Falta --conta <numeroConta> [<numeroConta> ...]. Os clientes têm de existir; o script não cria cliente.",
    );
  }
  const tipo = normalizarTipoParceiro(TIPO_BRUTO);
  if (!tipo) throw new Error(`--tipo inválido: ${JSON.stringify(TIPO_BRUTO)}`);

  // ── Os acordos ─────────────────────────────────────────────────────────
  //
  // O acordo real do parceiro tem VÁRIAS linhas — uma por tipo de produto,
  // porque é assim que a #318 modela ("percentual varia por tipo de produto").
  // Rodar o script seis vezes para gravar seis linhas faria seis transações e
  // seis chances de parar no meio; aqui elas entram JUNTAS, na mesma.
  //
  // Linha com 0% é acordo, não ausência de acordo: registra que aquele produto
  // foi DECIDIDO como fora, em vez de deixar o silêncio ser interpretado como
  // "ainda não cadastrei".
  const pares = ACORDOS_BRUTOS.slice();
  if (PRODUTO_BRUTO || PERCENTUAL_BRUTO) {
    if (!PRODUTO_BRUTO || !PERCENTUAL_BRUTO) {
      throw new Error("--produto e --percentual andam juntos. Ou use --acordo <produto>:<percentual>.");
    }
    pares.push(`${PRODUTO_BRUTO}:${PERCENTUAL_BRUTO}`);
  }
  if (pares.length === 0) {
    throw new Error(
      "Falta --acordo <idDoNo>:<percentual> (repetível). Não há default: o acordo é decisão de negócio.",
    );
  }

  const acordos: { empresaId: string; bruto: string; percentual: Prisma.Decimal }[] = [];
  for (const par of pares) {
    // `lastIndexOf` e não `split`: um produto com dois-pontos no nome quebraria
    // o split, e o percentual é sempre o pedaço DEPOIS do último separador.
    const corte = par.lastIndexOf(":");
    if (corte <= 0 || corte === par.length - 1) {
      throw new Error(`--acordo inválido: ${JSON.stringify(par)}. Formato: <idDoNo>:<percentual>.`);
    }
    const brutoNo = par.slice(0, corte).trim();
    const brutoPercentual = par.slice(corte + 1);

    // O destino agora é o ID DO NÓ da hierarquia (`Empresa.id`, que é slug:
    // "corretora", "imobiliaria"…). Não há normalização a fazer — ou o nó
    // existe, ou não existe, e quem responde isso é o banco logo abaixo.
    if (!brutoNo) throw new Error(`--acordo com nó inválido: ${JSON.stringify(par)}`);
    if (acordos.some((a) => a.empresaId === brutoNo)) {
      throw new Error(`--acordo repetido para o nó "${brutoNo}".`);
    }

    // Decimal e não Number: o percentual é DECIMAL(7,4) no banco, e converter
    // por float aqui derrotaria a escolha da #318 na própria porta de entrada.
    let percentual: Prisma.Decimal;
    try {
      percentual = new Prisma.Decimal(brutoPercentual);
    } catch {
      throw new Error(`--acordo com percentual não numérico: ${JSON.stringify(brutoPercentual)}`);
    }
    if (percentual.lessThan(0) || percentual.greaterThan(100)) {
      // O CHECK do banco também barra, mas falhar aqui dá uma mensagem que diz
      // o que fazer em vez de um erro de constraint.
      throw new Error(`--acordo com percentual fora de 0–100: ${percentual.toString()}`);
    }
    acordos.push({ empresaId: brutoNo, bruto: brutoNo, percentual });
  }

  // ── Início da vigência ─────────────────────────────────────────────────
  let dataInicio: Date | null = null;
  if (DATA_INICIO_BRUTA) {
    // Meio-dia UTC quando vier só a data: a meia-noite de uma data ISO pode
    // cair no dia anterior em qualquer fuso a oeste, e "vigente desde 01/08"
    // virando 31/07 é o tipo de erro que ninguém confere.
    const texto = /^\d{4}-\d{2}-\d{2}$/.test(DATA_INICIO_BRUTA)
      ? `${DATA_INICIO_BRUTA}T12:00:00Z`
      : DATA_INICIO_BRUTA;
    const d = new Date(texto);
    if (Number.isNaN(d.getTime())) {
      throw new Error(`--data-inicio não é data válida: ${JSON.stringify(DATA_INICIO_BRUTA)}. Use AAAA-MM-DD.`);
    }
    dataInicio = d;
  }

  passo(1, "Entrada normalizada");
  ok(`nome:  ${NOME}`);
  ok(`tipo:  ${TIPO_BRUTO} → ${tipo}`);
  ok(`vigência desde: ${dataInicio ? dataInicio.toISOString() : "agora (now())"}`);
  ok(`contas: ${CONTAS.length} — ${CONTAS.join(", ")}`);
  ok(`acordos: ${acordos.length}`);
  for (const a of acordos) ok(`   nó ${a.empresaId} · ${a.percentual.toString()}%`);
  if (!ehTipoParceiroConhecido(tipo)) aviso(`tipo "${tipo}" fora da lista de referência (permitido)`);
  // O nó tem de existir: FK barraria de qualquer jeito, e falhar aqui devolve
  // a lista do que existe em vez de um erro de constraint.
  const nosConhecidos = await prisma.empresa.findMany({ select: { id: true, nome: true } });
  const porId = new Map(nosConhecidos.map((n) => [n.id, n.nome]));
  const inexistentes = acordos.filter((a) => !porId.has(a.empresaId));
  if (inexistentes.length > 0) {
    throw new Error(
      `Nó(s) inexistente(s): ${inexistentes.map((a) => a.empresaId).join(", ")}. ` +
        `Existem: ${nosConhecidos.map((n) => n.id).join(", ")}.`,
    );
  }
  if (dataInicio && dataInicio.getTime() > Date.now()) {
    aviso("data-inicio no FUTURO: a linha nasce com dataFim null e já conta como vigente hoje.");
  }

  // ── Parceiro ───────────────────────────────────────────────────────────
  passo(2, "Parceiro");
  const parceiroExistente = await prisma.parceiro.findFirst({
    where: { nome: NOME },
    select: { id: true, nome: true, tipo: true, clienteBackofficeId: true },
  });
  ok(parceiroExistente ? `"${NOME}" já existe (${parceiroExistente.id})` : `"${NOME}" não existe — seria criado`);

  // ── O parceiro TAMBÉM é cliente? ───────────────────────────────────────
  //
  // `Parceiro.clienteBackofficeId` é o campo central da #306: parceiro PODE ser
  // cliente e não precisa ser. Sem ele preenchido, um sócio que também tem
  // conta na casa entra no sistema como duas pessoas diferentes, e ninguém
  // consegue perguntar "quanto o Renan tem, entre o que é dele e o que ele
  // trouxe?" sem casar nome à mão.
  //
  // Opcional, e resolvido pelas MESMAS regras das outras contas — inclusive a
  // recusa por homônimo. Uma identidade atribuída ao cliente errado é pior que
  // identidade nenhuma.
  let identidade: { id: string; nome: string } | null = null;
  if (PARCEIRO_CONTA) {
    const achados = await prisma.clienteBackoffice.findMany({
      where: { numeroConta: PARCEIRO_CONTA },
      select: { id: true, nome: true },
    });
    if (achados.length === 0) {
      throw new Error(`--parceiro-conta ${PARCEIRO_CONTA}: nenhum cliente com este numeroConta.`);
    }
    if (achados.length > 1) {
      throw new Error(
        `--parceiro-conta ${PARCEIRO_CONTA}: ${achados.length} clientes — ` +
          `${achados.map((c) => `${c.id} (${c.nome})`).join(", ")}. Desambigue antes.`,
      );
    }
    identidade = achados[0];

    // @unique em clienteBackofficeId: se OUTRO parceiro já reivindica esta
    // conta, o UPDATE falharia com unique_violation no meio da transação.
    const jaReivindicado = await prisma.parceiro.findUnique({
      where: { clienteBackofficeId: identidade.id },
      select: { id: true, nome: true },
    });
    if (jaReivindicado && jaReivindicado.id !== parceiroExistente?.id) {
      throw new Error(
        `A conta ${PARCEIRO_CONTA} (${identidade.nome}) já é a identidade do parceiro ` +
          `"${jaReivindicado.nome}". Uma conta representa no máximo um parceiro.`,
      );
    }

    // Trocar identidade é decisão de negócio, do mesmo tipo de mudar percentual
    // (regra (b) da #318): um seed não a toma sozinho.
    if (
      parceiroExistente?.clienteBackofficeId &&
      parceiroExistente.clienteBackofficeId !== identidade.id
    ) {
      throw new Error(
        `"${NOME}" já tem identidade de cliente (${parceiroExistente.clienteBackofficeId}) ` +
          `diferente da conta ${PARCEIRO_CONTA}. NÃO sobrescrito: trocar identidade é decisão de negócio.`,
      );
    }

    if (parceiroExistente?.clienteBackofficeId === identidade.id) {
      ok(`identidade já gravada: ${identidade.nome} (conta ${PARCEIRO_CONTA})`);
    } else {
      ok(`identidade de cliente: ${identidade.nome} (conta ${PARCEIRO_CONTA})`);
    }
  } else {
    ok("sem --parceiro-conta: o parceiro não fica ligado a nenhuma conta própria");
  }

  // ── Uma passada por conta, sem escrever nada ───────────────────────────
  passo(3, `Clientes (${CONTAS.length} conta(s))`);
  const situacoes: Situacao[] = [];

  for (const conta of CONTAS) {
    // findMany e não findFirst: numeroConta NÃO é @unique no schema (ver
    // upsert-cliente.ts:10-11). Duas contas com o mesmo número é situação real,
    // e escolher em silêncio a primeira vincularia o parceiro ao cliente errado.
    const clientes = await prisma.clienteBackoffice.findMany({
      where: { numeroConta: conta },
      select: { id: true, nome: true, saldo: true },
    });

    if (clientes.length === 0) {
      situacoes.push({ conta, estado: "nao_encontrada" });
      erro(`${conta} — nenhum cliente com este numeroConta`);
      continue;
    }
    if (clientes.length > 1) {
      const candidatos = clientes.map((c) => `${c.id} (${c.nome})`).join(", ");
      situacoes.push({ conta, estado: "ambigua", candidatos });
      erro(`${conta} — ${clientes.length} clientes: ${candidatos}`);
      continue;
    }

    const cliente = clientes[0];
    const vinculoVigente = await prisma.parceiroCliente.findFirst({
      where: { clienteId: cliente.id, dataFim: null },
      select: { parceiroId: true },
    });

    if (!vinculoVigente) {
      situacoes.push({ conta, estado: "vincular", clienteId: cliente.id, nome: cliente.nome, saldo: cliente.saldo });
      ok(`${conta} — ${cliente.nome} · PL ${cliente.saldo.toLocaleString("pt-BR")} · sem parceiro vigente`);
      continue;
    }

    // Vigente e É este parceiro: reexecução, não conflito.
    if (parceiroExistente && vinculoVigente.parceiroId === parceiroExistente.id) {
      situacoes.push({
        conta,
        estado: "ja_vinculado",
        clienteId: cliente.id,
        nome: cliente.nome,
        saldo: cliente.saldo,
      });
      ok(`${conta} — ${cliente.nome} · já vinculado a "${NOME}" (nada a fazer)`);
      continue;
    }

    // Vigente e é OUTRO parceiro: a #310 rejeitaria o INSERT com
    // unique_violation. Melhor dizer agora, com o nome, do que devolver o
    // código do erro no meio da transação.
    const dono = await prisma.parceiro.findUnique({
      where: { id: vinculoVigente.parceiroId },
      select: { nome: true },
    });
    situacoes.push({
      conta,
      estado: "ocupada",
      nome: cliente.nome,
      parceiroAtual: dono?.nome ?? vinculoVigente.parceiroId,
    });
    erro(`${conta} — ${cliente.nome} já tem parceiro vigente: ${dono?.nome ?? vinculoVigente.parceiroId}`);
  }

  // ── Acordos: o que já existe vigente ───────────────────────────────────
  //
    // Conferido AQUI, antes da barreira do tudo-ou-nada, e não dentro da
  // transação: acordo vigente com OUTRO percentual é recusa, e recusa
  // descoberta no meio da escrita deixaria o relatório pela metade.
  passo(4, `Acordos (${acordos.length})`);
  const acordosACriar: typeof acordos = [];
  const acordosEmConflito: string[] = [];
  for (const a of acordos) {
    const vigente = parceiroExistente
      ? await prisma.acordoComercialParceiro.findFirst({
          where: { parceiroId: parceiroExistente.id, empresaId: a.empresaId, dataFim: null },
          select: { percentual: true },
        })
      : null;
    if (!vigente) {
      acordosACriar.push(a);
      ok(`${porId.get(a.empresaId)} — ${a.percentual.toString()}% · seria criado`);
    } else if (vigente.percentual.equals(a.percentual)) {
      ok(`${porId.get(a.empresaId)} — ${a.percentual.toString()}% · já vigente, nada a fazer`);
    } else {
      // Alterar percentual é fechar-e-abrir (regra (b) da #318): reescrever no
      // lugar mudaria o passado, e o fechamento de um mês já encerrado passaria
      // a usar um número que não valia lá.
      acordosEmConflito.push(
        `${porId.get(a.empresaId)}: vigente ${vigente.percentual.toString()}%, pedido ${a.percentual.toString()}%`,
      );
      erro(`${porId.get(a.empresaId)} — vigente ${vigente.percentual.toString()}%, pedido ${a.percentual.toString()}%`);
    }
  }

  // ── Tudo-ou-nada ───────────────────────────────────────────────────────
  if (acordosEmConflito.length > 0) {
    linha();
    linha("─".repeat(72));
    linha(`${acordosEmConflito.length} acordo(s) já vigente(s) com OUTRO percentual. NADA foi escrito.`);
    for (const c of acordosEmConflito) linha(`  ✗ ${c}`);
    linha("Mudar percentual é fechar o vigente e abrir outro — decisão de negócio, não de seed.");
    linha("─".repeat(72));
    throw new Error("Lote não aplicado — resolva os acordos acima e rode de novo.");
  }

  const falhas = situacoes.filter(ehFalha);
  if (falhas.length > 0) {
    linha();
    linha("─".repeat(72));
    linha(`${falhas.length} de ${CONTAS.length} conta(s) impedem o lote. NADA foi escrito.`);
    for (const f of falhas) {
      const motivo =
        f.estado === "nao_encontrada"
          ? "não encontrada"
          : f.estado === "ambigua"
            ? `ambígua — ${f.candidatos}`
            : `ocupada por "${f.parceiroAtual}"`;
      linha(`  ✗ ${f.conta}: ${motivo}`);
    }
    linha("─".repeat(72));
    throw new Error("Lote não aplicado — resolva as contas acima e rode de novo.");
  }

  // ── Plano ──────────────────────────────────────────────────────────────
  const aVincular = situacoes.filter(ehVincular);
  const jaVinculados = situacoes.filter((s) => s.estado === "ja_vinculado");

  passo(5, "Plano");
  const gravaIdentidade = identidade !== null && parceiroExistente?.clienteBackofficeId !== identidade.id;
  plano(parceiroExistente ? `REUSAR Parceiro ${parceiroExistente.id}` : `CRIAR Parceiro "${NOME}" (tipo ${tipo})`);
  if (gravaIdentidade) plano(`LIGAR o parceiro à conta ${PARCEIRO_CONTA} (${identidade!.nome})`);
  plano(
    `CRIAR ${acordosACriar.length} acordo(s)` +
      (acordosACriar.length
        ? ": " + acordosACriar.map((a) => `${porId.get(a.empresaId)} ${a.percentual.toString()}%`).join(", ")
        : ""),
  );
  plano(`VINCULAR ${aVincular.length} cliente(s)${aVincular.length ? ": " + aVincular.map((s) => s.conta).join(", ") : ""}`);
  if (jaVinculados.length) plano(`PULAR ${jaVinculados.length} já vinculado(s): ${jaVinculados.map((s) => s.conta).join(", ")}`);

  if (!APLICAR) {
    linha();
    linha("─".repeat(72));
    linha("DRY-RUN: nada foi escrito. Para aplicar, repita com --aplicar.");
    linha("─".repeat(72));
    return;
  }

  // ── Aplicação, em transação e idempotente ──────────────────────────────
  //
  // Uma transação para o lote inteiro: se o último vínculo falhar (por uma
  // corrida com outra escrita, por exemplo), o parceiro e o acordo voltam
  // atrás junto. Meio-lote é o estado que este script existe para não criar.
  passo(6, "Aplicando");
  const agora = new Date();
  // Vínculo e acordo compartilham o mesmo instante quando não há data
  // combinada — nasceram da mesma decisão, e datas diferentes por milissegundos
  // sugeririam dois eventos onde houve um.
  const inicio = dataInicio ?? agora;

  await prisma.$transaction(async (tx) => {
    const parceiro =
      parceiroExistente ??
      (await tx.parceiro.create({
        data: {
          nome: NOME,
          tipo,
          // Já nasce ligado quando a conta veio na linha de comando — um
          // UPDATE logo depois deixaria uma janela com o parceiro sem
          // identidade, e é justamente essa janela que a #306 quis fechar.
          clienteBackofficeId: identidade?.id ?? null,
          criadoPor: "seed-parceiro-piloto",
        },
        select: { id: true, nome: true, tipo: true, clienteBackofficeId: true },
      }));
    ok(`Parceiro ${parceiro.id}`);

    // Parceiro que já existia e ainda não tinha identidade. As duas recusas
    // (conta de outro parceiro, identidade diferente já gravada) foram
    // resolvidas no passo 2 — aqui só resta o caso limpo.
    if (identidade && parceiro.clienteBackofficeId !== identidade.id) {
      await tx.parceiro.update({
        where: { id: parceiro.id },
        data: { clienteBackofficeId: identidade.id, atualizadoPor: "seed-parceiro-piloto" },
      });
      ok(`Identidade de cliente ligada — ${identidade.nome}`);
    }

    // Acordos: só os que faltam. Conflito de percentual já barrou o lote no
    // passo 4 — chegar aqui significa que não há decisão de negócio pendente.
    // Reconferidos dentro da transação de propósito: entre a leitura e a
    // escrita cabe uma corrida, e o índice parcial único da #318 devolveria
    // erro de constraint em vez de mensagem.
    for (const a of acordosACriar) {
      const jaVigente = await tx.acordoComercialParceiro.findFirst({
        where: { parceiroId: parceiro.id, empresaId: a.empresaId, dataFim: null },
        select: { id: true },
      });
      if (jaVigente) {
        ok(`Acordo em ${porId.get(a.empresaId)} já vigente — nada a fazer`);
        continue;
      }
      const novo = await tx.acordoComercialParceiro.create({
        data: {
          parceiroId: parceiro.id,
          empresaId: a.empresaId,
          percentual: a.percentual,
          dataInicio: inicio,
          criadoPor: "seed-parceiro-piloto",
        },
        select: { id: true },
      });
      ok(`Acordo ${novo.id} — ${a.percentual.toString()}% em ${porId.get(a.empresaId)}`);
    }

    for (const s of aVincular) {
      const v = await tx.parceiroCliente.create({
        data: {
          parceiroId: parceiro.id,
          clienteId: s.clienteId,
          dataInicio: inicio,
          vinculadoPor: "seed-parceiro-piloto",
        },
        select: { id: true },
      });
      ok(`Vínculo ${v.id} — ${s.conta} · ${s.nome}`);
    }
    for (const s of jaVinculados) ok(`Vínculo pulado — ${s.conta} já era de "${NOME}"`);
  });

  // ── Conferência: o que a modelagem responde agora ──────────────────────
  passo(7, "Conferência — as perguntas que a Fase 1 existe para responder");
  const parceiro = await prisma.parceiro.findFirstOrThrow({
    where: { nome: NOME },
    select: {
      id: true,
      nome: true,
      tipo: true,
      clienteBackoffice: { select: { nome: true, numeroConta: true, saldo: true } },
      acordos: {
        where: { dataFim: null },
        select: { percentual: true, empresa: { select: { nome: true } } },
      },
      clientes: {
        where: { dataFim: null },
        select: { cliente: { select: { nome: true, saldo: true } } },
      },
    },
  });
  ok(`"${parceiro.nome}" (${parceiro.tipo})`);
  // O PL próprio fica FORA do AUM abaixo de propósito: o que ele traz e o que
  // ele tem são números diferentes, e somá-los inflaria a carteira do parceiro
  // com o dinheiro dele mesmo.
  if (parceiro.clienteBackoffice) {
    ok(
      `  é cliente: ${parceiro.clienteBackoffice.nome} · conta ${parceiro.clienteBackoffice.numeroConta}` +
        ` · PL próprio ${parceiro.clienteBackoffice.saldo.toLocaleString("pt-BR")}`,
    );
  }
  for (const a of parceiro.acordos) ok(`  acordo vigente: ${a.percentual.toString()}% em ${a.empresa.nome}`);
  const aum = parceiro.clientes.reduce((s, c) => s + c.cliente.saldo, 0);
  ok(`  clientes vigentes: ${parceiro.clientes.length} · AUM ${aum.toLocaleString("pt-BR")}`);
  for (const c of parceiro.clientes) ok(`    ${c.cliente.nome} · ${c.cliente.saldo.toLocaleString("pt-BR")}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(`\n✗ ${e instanceof Error ? e.message : e}`);
    await prisma.$disconnect();
    process.exit(1);
  });
