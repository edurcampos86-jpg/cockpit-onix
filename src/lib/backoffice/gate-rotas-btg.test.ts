import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

/**
 * As três rotas BTG que escreviam em massa sem gate de papel.
 *
 * ── POR QUE ESTE TESTE LÊ A FONTE EM VEZ DE CHAMAR O HANDLER ────────────
 * O gate resolve identidade por `getAuthContext()` → sessão → Prisma. Chamar
 * o handler exigiria banco, e um teste de autorização que depende de banco é
 * o mesmo erro registrado em `src/lib/integrations/zapier-acesso.ts:6-10`:
 * fica caro, não roda em CI, e a regra volta a não ter guarda.
 *
 * ── E POR QUE ELE NÃO REPETE O ERRO DA #429 ─────────────────────────────
 * Ali um teste conferia o NOME de um símbolo exportado e, por isso, falhava
 * na direção perigosa: renomear o símbolo fazia o teste passar dizendo que
 * estava tudo bem. Aqui é o inverso — renomear ou remover `guardAdminApi`
 * quebra o teste. Toda mutação plausível (apagar a linha, movê-la para
 * depois da primeira query, trocar por um guard mais fraco) falha ALTO.
 *
 * O que este teste NÃO prova: que `guardAdminApi` decide certo. Isso é
 * responsabilidade de `isAdmin` em `src/lib/rbac-papeis.ts`. Aqui se prova
 * só que as três portas passam por ele, e antes de tocar o banco.
 */
const ROTAS = [
  {
    nome: "btg-sync",
    arquivo: "src/app/api/backoffice/btg-sync/route.ts",
    // Reescreve saldo/saldoConta/positionDate de TODOS os clientes com conta.
    // Não grava BtgSyncLog: não há registro de quem disparou.
    escrita: /prisma\.clienteBackoffice\.update\(/,
  },
  {
    nome: "btg-import",
    arquivo: "src/app/api/backoffice/btg-import/route.ts",
    // Atualiza E CRIA ClienteBackoffice em laço sobre a base de contas BTG.
    escrita: /prisma\.clienteBackoffice\.create\(/,
  },
  {
    nome: "btg-enrich",
    arquivo: "src/app/api/backoffice/btg-enrich/route.ts",
    // upsert em ComissaoMensalCliente: sobrescreve receita da competência.
    escrita: /prisma\.comissaoMensalCliente\.upsert\(/,
  },
] as const;

/**
 * Recorta o corpo de um `if (…)` — o statement único, ou o bloco balanceado.
 * Existe porque procurar "o próximo return" depois do `if` encontra returns de
 * outros ramos e faz o teste passar com o guard desarmado.
 */
function corpoDoIf(fonte: string, cabecalho: string): string {
  const i = fonte.indexOf(cabecalho);
  if (i < 0) return "";
  let j = i + cabecalho.length;
  while (j < fonte.length && /\s/.test(fonte[j])) j++;
  if (fonte[j] !== "{") {
    // Statement único: até o `;`.
    const fim = fonte.indexOf(";", j);
    return fonte.slice(j, fim < 0 ? fonte.length : fim + 1);
  }
  let nivel = 0;
  for (let k = j; k < fonte.length; k++) {
    if (fonte[k] === "{") nivel++;
    else if (fonte[k] === "}" && --nivel === 0) return fonte.slice(j, k + 1);
  }
  return fonte.slice(j);
}

function fonteDe(arquivo: string): string {
  return readFileSync(path.join(process.cwd(), arquivo), "utf8");
}

for (const rota of ROTAS) {
  test(`${rota.nome}: o POST chama guardAdminApi`, () => {
    const fonte = fonteDe(rota.arquivo);
    assert.match(
      fonte,
      /import \{[^}]*guardAdminApi[^}]*\} from "@\/lib\/api-admin-guard"/,
      "o guard precisa vir de @/lib/api-admin-guard — não reimplementar a checagem no arquivo",
    );
    assert.match(
      fonte,
      /const negado = await guardAdminApi\(/,
      "guardAdminApi precisa ser chamado E ter o retorno guardado",
    );
    // A recusa precisa ser DEVOLVIDA de dentro do próprio `if`, não só
    // calculada. Duas formas são aceitas — `if (negado) return negado;` e um
    // bloco que devolve corpo próprio (btg-enrich faz isso, porque tem
    // chamador de tela que renderiza `data.message`).
    //
    // A primeira versão deste teste procurava o próximo `return` DEPOIS do
    // `if`, e passava em `if (negado) console.warn(negado);` — porque
    // encontrava o `return` do `if (!session)` logo abaixo. Um teste de
    // autorização que passa com o guard desarmado é pior que não existir,
    // então aqui o corpo do `if` é recortado antes de ser conferido.
    assert.match(
      fonte,
      /if \(negado\)/,
      "chamar o guard sem testar o retorno não protege nada",
    );
    assert.match(
      corpoDoIf(fonte, "if (negado)"),
      /\breturn\b/,
      "o `if (negado)` precisa DEVOLVER a recusa — logar e seguir não protege nada",
    );
  });

  test(`${rota.nome}: o gate vem ANTES de qualquer acesso ao banco`, () => {
    const fonte = fonteDe(rota.arquivo);
    // A ordem é o que importa. Um guard depois da primeira query é um guard
    // que não impediu a query — e foi assim que a auditoria da Fase 1
    // classificou "gate existe mas acontece tarde demais".
    const gate = fonte.indexOf("await guardAdminApi(");
    const primeiraQuery = fonte.search(/\bawait prisma\./);
    assert.ok(gate >= 0, "guardAdminApi não encontrado");
    assert.ok(primeiraQuery >= 0, "nenhum acesso ao banco encontrado — a rota mudou de forma");
    assert.ok(
      gate < primeiraQuery,
      `guardAdminApi (índice ${gate}) precisa vir antes do primeiro await prisma (índice ${primeiraQuery})`,
    );
  });

  test(`${rota.nome}: a escrita em massa que motivou o gate continua lá`, () => {
    // Guarda contra o teste virar decorativo: se a escrita sumir do arquivo,
    // os dois testes acima passariam a proteger uma rota que não escreve
    // mais, e ninguém notaria que o alvo mudou.
    assert.match(
      fonteDe(rota.arquivo),
      rota.escrita,
      "a escrita em massa esperada sumiu — reavalie se o gate ainda é o certo",
    );
  });
}

test("nenhuma das três rotas confia só em getSession para autorizar", () => {
  // `getSession()` sozinho é exatamente a condição que o `src/proxy.ts` já
  // garante: era o "gate" das três, e não gateava nada. Em btg-import e
  // btg-enrich ele CONTINUA no arquivo de propósito — o userId vai para o
  // BtgSyncLog —, então o que se testa é que ele não é o primeiro controle.
  for (const rota of ROTAS) {
    const fonte = fonteDe(rota.arquivo);
    const gate = fonte.indexOf("await guardAdminApi(");
    const sessao = fonte.indexOf("await getSession(");
    if (sessao >= 0) {
      assert.ok(
        gate < sessao,
        `${rota.nome}: guardAdminApi precisa vir antes de getSession — senão a autorização depende da ordem errada`,
      );
    }
  }
});
