# ADM/Financeiro — proposta de modelo de dados

> **Nada aqui foi implementado.** Este documento é a proposta que a governança
> exige antes do código: migration é faixa vermelha, e o Eduardo lê o SQL
> antes. O que existe é este texto e os fatos de recon que o sustentam.

## 0. O que o recon achou, e o que ele muda na proposta

| pergunta | resposta, e onde está no código |
|---|---|
| já existe algo de "campanha de parceiro"? | **não.** As únicas ocorrências de "campanha" são de tráfego pago (`AdCampaignSnapshot`, `pixel-trafego/*`). Campanha nasce do zero |
| já existe parcela / cronograma / recorrência? | **não.** `grep -niE "parcela\|recorren\|cronograma\|vencimento"` no schema devolve **duas** linhas, nenhuma financeira (`objecoesRecorrentes`, `EventoVida.recorrente`) |
| já existe despesa? | **não**, em lugar nenhum. É por isso que "ROI" é rótulo errado hoje |
| quantas abas se chamam ROI? | **5** páginas reais: `corporate`, `corretora`, `imobiliaria`, `planejamento`, `tech` — todas `EmpresaPlaceholder`. A Onix Capital tem uma sexta aba rotulada "ROI" que aponta para `/empresas/investimentos/receita`, que é **tela de importação**, não de ROI |
| a hierarquia comporta o consolidador? | **sim, pronta.** `onix-co-adm` existe com `consolida: true` (`src/lib/empresas/catalogo.ts:181`) e cada uma das 6 empresas tem seu `<empresa>-adm` |
| Planejamento e Corporate são empresas? | **não — são departamentos da Corretora** (`catalogo.ts:299` e `:322`). A receita do seguro resgatável de 10 anos rola para dentro da Corretora |

**Consequência de recon que muda o desenho:** o cronograma de parcelas é
território virgem. Não há nada para reaproveitar ali, e também nada para
quebrar. Já o **caminho de importação** é o oposto: `PerfilImportacao` foi
escrito para isto e diz por escrito que foi (`schema.prisma:3474`):

> *"GENÉRICO DE PROPÓSITO: NADA AQUI FALA DE SEGURO. (…) uma planilha de
> imóveis da Imobiliária, com colunas 'Endereço', 'Valor Locação' e
> 'Proprietário', é o MESMO `PerfilImportacao` com outro conteúdo em
> `mapeamentoColunas`."*

É a resposta pronta para *"os relatórios chegam em datas e formatos diferentes
por empresa"* — sem uma linha de migration.

---

## 1. As tabelas

Quatro novas, duas alteradas, uma aposentada. Em ordem de dependência.

### 1.1 `RegraReceita` — a régua que gera o cronograma

A peça que resolve *"percentual DIFERENTE a cada ano por 10 anos"* e
*"consórcio varia por parceiro"* sem uma coluna por caso.

```prisma
model RegraReceita {
  id        String  @id @default(cuid())

  empresaId String
  empresa   Empresa @relation(fields: [empresaId], references: [id], onDelete: Restrict)

  /// "Seguro resgatável 10 anos — Icatu", "Consórcio 8x — Rodobens"
  nome      String

  /// "percentual_por_parcela" | "valor_por_parcela" | "percentual_fixo"
  /// String validada em código (postura do `tipoProduto`): régua nova é
  /// decisão comercial, não pode custar migration vermelha.
  tipo      String

  /// "mensal" | "anual" | "unica"
  periodicidade String

  /// null = INDEFINIDO (plano de saúde: mensal até cancelar).
  /// Quando null, a projeção usa `HORIZONTE_PADRAO` e é reprojetada.
  quantidadeParcelas Int?

  /// A ESCADA. Lida inteira, nunca filtrada entre regras:
  ///   [{ordem:1, percentual:"0.6500"}, {ordem:2, percentual:"0.1200"}, …]
  ///   [{ordem:1, valor:"1200.00"}, {ordem:2, valor:"380.00"}, …]
  escada Json

  /// De qual parceiro é esta régua. Texto, igual a `ContratoCorretora.parceiro`
  /// (de ONDE o produto vem), distinto de `parceiroId` (quem INDICOU).
  parceiro String?

  /// Régua muda; contrato antigo mantém a régua que o gerou.
  vigenteDe  DateTime  @default(now())
  vigenteAte DateTime?
  ativa      Boolean   @default(true)

  criadoPor    String?
  criadoEm     DateTime @default(now())
  atualizadoEm DateTime @updatedAt

  contratos Contrato[]

  @@unique([empresaId, nome, vigenteDe])
  @@index([empresaId, ativa])
}
```

**Por que `escada` é Json e não tabela filha.** A régua do schema já está
escrita, em `ContratoCorretora.dadosProduto`: *"a régua para promover qualquer
chave daqui a coluna é uma só: alguém precisou dela num `WHERE`."* Ninguém vai
perguntar *"quais regras têm 3% no ano 7"*. A escada é lida inteira, junto com
o contrato, para gerar as parcelas — e as parcelas geradas **são** colunas, com
índice, porque essas sim entram em `WHERE`, `SUM` e `ORDER BY`.

**Os quatro casos reais, na escada:**

| caso | `tipo` | `periodicidade` | `quantidadeParcelas` | `escada` |
|---|---|---|---|---|
| seguro resgatável 10 anos | `percentual_por_parcela` | `anual` | `10` | 10 degraus, percentual distinto cada |
| consórcio 8x | `percentual_por_parcela` | `mensal` | `8` | 8 degraus, um por parceiro |
| plano de saúde | `valor_por_parcela` | `mensal` | `null` | `[{ordem:1, valor:entrada}, {ordem:2, valor:mensal, repete:true}]` |
| administração de aluguel | `percentual_fixo` | `mensal` | `null` | `[{percentual:"0.1000", repete:true}]` |
| Fee Fixo / previdência | `percentual_fixo` ou `valor_por_parcela` | `mensal` | `null` | um degrau que repete |

`repete: true` no último degrau é o que representa *"até cancelar"*: a projeção
repete aquele degrau até o horizonte.

---

### 1.2 `Contrato` — `ContratoCorretora` generalizada

**Renomear, não criar paralelo.** O próprio schema convida
(`schema.prisma:3293`): *"Existe mesmo sendo hoje sempre 'corretora': a tabela
é o molde das irmãs que vêm depois."* Ela já tem `empresaId` FK real,
`pessoaGrupoId`, vigências, `status` com `cancelado ≠ encerrado`, `premio` e
`comissao` em `Decimal(14,2)`, `dadosProduto Json`, e o rastro de importação
inteiro. Criar uma `ContratoReceita` ao lado seria duplicar 25 colunas
pensadas.

**Colunas NOVAS (todas nullable ou com default — nenhuma quebra o que existe):**

```prisma
  /// Qual régua gera o cronograma. null = contrato sem projeção (só avulso).
  regraReceitaId String?
  regraReceita   RegraReceita? @relation(fields: [regraReceitaId], references: [id], onDelete: Restrict)

  /// A BASE sobre a qual o percentual da régua incide: prêmio do seguro,
  /// carta de crédito do consórcio, valor do aluguel, PL sob Fee Fixo.
  /// Distinto de `premio`, que é o prêmio pago pelo cliente à seguradora —
  /// nem sempre são o mesmo número, e colapsá-los erraria a projeção.
  valorBase Decimal? @db.Decimal(14, 2)

  /// Dia do mês do vencimento, quando o contrato o fixa.
  diaVencimento Int?

  /// QUANDO a projeção para. `status` já diz SE parou; isto diz A PARTIR DE
  /// QUANDO — e é o que separa "cancelado ontem" de "cancelado em janeiro".
  encerradoEm       DateTime?
  motivoEncerramento String?   // "cancelamento" | "inadimplencia" | "fim_natural" | "distrato"

  /// Quem do TIME originou o contrato. FK real para Pessoa — é o eixo da
  /// apuração de campanha, e por isso não pode ser texto como
  /// `atendenteCorretora`.
  pessoaId String?
  pessoa   Pessoa? @relation("ContratoOriginador", fields: [pessoaId], references: [id], onDelete: SetNull)

  parcelas ParcelaReceita[]

  @@index([regraReceitaId])
  @@index([pessoaId, status])
```

**O rename só acontece se a tabela estiver VAZIA em produção — e isso ainda não
foi medido nesta sessão.** `docs/onix-co-estado.md:668` sustenta "vazia" por
uma cadeia de três elos verificados no código, e diz honestamente onde a cadeia
para: *"da #390 até a #410 passaram quatro dias em que criar perfil pela tela e
importar já era possível — e nesse intervalo a garantia não é mais mecânica."*

`scripts/contagem-tabelas.ts:68` já conta `ContratoCorretora`, mas o guarda por
diff do `estado-do-banco.yml` só o executa quando a PR **toca o script**. A PR
da migration vai tocá-lo (para acrescentar as tabelas novas), então **o número
ao vivo chega na própria PR, antes do "ok" do SQL**. Se vier diferente de zero,
o rename sai e a tabela mantém o nome — o resto da proposta não muda.

---

### 1.3 `ParcelaReceita` — toda linha de dinheiro, projetada ou apurada

O coração. Uma linha = um valor, numa competência, de um nó da hierarquia.

```prisma
model ParcelaReceita {
  id String @id @default(cuid())

  /// O NÓ que ganhou. NOT NULL — receita sem dono é o erro que a #416 mediu
  /// em outro campo. É o eixo do consolidador: somar as 6 empresas é subir
  /// por `Empresa.parentId` até a holding.
  empresaId String
  empresa   Empresa @relation(fields: [empresaId], references: [id], onDelete: Restrict)

  /// null = LANÇAMENTO AVULSO. Esta única coluna nullable é o que torna o
  /// modelo "misto" UMA tabela em vez de duas: venda de imóvel e comissão de
  /// alocação nascem sem contrato; administração mensal e consórcio nascem
  /// com. As duas somam na mesma query.
  contratoId String?
  contrato   Contrato? @relation(fields: [contratoId], references: [id], onDelete: Restrict)

  /// "AAAA-MM", com CHECK na migration. Precedente já aprovado em
  /// `ComissaoMensalCliente.competencia`, e pela mesma razão: competência é
  /// RÓTULO de mês, não instante — `DateTime` obrigaria a escolher dia e fuso
  /// que ninguém quis dizer.
  competencia String

  /// O dia dentro da competência, quando conhecido. Ordena dentro do mês e
  /// alimenta "o que vence esta semana".
  vencimento DateTime?

  /// Qual degrau da escada. null para avulso.
  ordem Int?

  /// "projecao" | "apuracao" | "manual" — entra na chave única.
  /// Projeção e apuração da MESMA competência COEXISTEM, de propósito: a
  /// diferença entre as duas é o número que o ADM quer ver. Apagar uma com a
  /// outra perderia justamente a divergência — é a decisão que já está
  /// escrita em `ComissaoMensalCliente.fonte`.
  origem String

  /// "prevista" | "recebida" | "cancelada" | "inadimplente"
  status String @default("prevista")

  valorBruto   Decimal @db.Decimal(14, 2)
  imposto      Decimal @db.Decimal(14, 2) @default(0)
  valorLiquido Decimal @db.Decimal(14, 2)

  /// QUEM PAGOU. Documento, não nome — é o que `ReceitaItem` errou.
  pessoaGrupoId String?
  pessoaGrupo   PessoaGrupo? @relation(fields: [pessoaGrupoId], references: [id], onDelete: Restrict)

  /// O cliente de Investimentos, quando a linha é dele. É o que permite
  /// `ComissaoMensalCliente` ser absorvida sem perder o detalhe por cliente.
  clienteId String?
  cliente   ClienteBackoffice? @relation("ParcelaDoCliente", fields: [clienteId], references: [id], onDelete: Restrict)

  /// QUEM DO TIME ganhou. O eixo da apuração de campanha.
  pessoaId String?
  pessoa   Pessoa? @relation("ParcelaDaPessoa", fields: [pessoaId], references: [id], onDelete: SetNull)

  /// Qual parceiro. O outro eixo da campanha.
  parceiroId String?
  parceiro   Parceiro? @relation("ParceiroParcela", fields: [parceiroId], references: [id], onDelete: SetNull)

  produto String?

  /// "projecao_regra" | "importacao" | "manual" | "btg_rm_reports"
  fonte String

  // ── Rastro de importação: mesmas colunas de `ContratoCorretora` ────────
  perfilImportacaoId String?
  perfilImportacao   PerfilImportacao? @relation(fields: [perfilImportacaoId], references: [id], onDelete: SetNull)
  loteImportacao String?
  arquivoOrigem  String?
  linhaOrigem    Int?
  importadoEm    DateTime?

  /// Dedupe do AVULSO, que não tem (contrato, ordem) para casar.
  /// sha1 de empresa+competencia+valor+pagador+produto+origem — a mesma
  /// técnica que `ReceitaItem.hash` já usa e que funcionou.
  hashOrigem String? @unique

  criadoEm     DateTime @default(now())
  atualizadoEm DateTime @updatedAt

  /// IDEMPOTÊNCIA do contrato. Reprojetar não duplica; reimportar o mesmo mês
  /// atualiza. Sem ela, rodar a projeção duas vezes dobraria o cronograma.
  @@unique([contratoId, competencia, ordem, origem])

  /// A consulta do ADM: "quanto esta empresa fez neste mês, e quanto ainda
  /// vem". Empresa primeiro (menor cardinalidade, sempre presente).
  @@index([empresaId, competencia, status])
  /// O consolidador varre por competência atravessando empresas.
  @@index([competencia, origem])
  /// Apuração de campanha por pessoa.
  @@index([pessoaId, competencia])
  /// Visão do parceiro.
  @@index([parceiroId, competencia])
  /// Cronograma de um contrato, em ordem.
  @@index([contratoId, ordem])
  /// "o que vence e ainda não entrou" — inadimplência.
  @@index([status, vencimento])
  /// FKs restantes (o Postgres não indexa FK sozinho).
  @@index([pessoaGrupoId])
  @@index([clienteId])
  @@index([perfilImportacaoId])
  @@index([loteImportacao])
}
```

---

### 1.4 `CampanhaParceiro` e `CampanhaApuracao`

```prisma
model CampanhaParceiro {
  id String @id @default(cuid())

  parceiroId String
  parceiro   Parceiro @relation(fields: [parceiroId], references: [id], onDelete: Restrict)

  /// null = vale para o grupo inteiro.
  empresaId String?
  empresa   Empresa? @relation("CampanhaEmpresa", fields: [empresaId], references: [id], onDelete: Restrict)

  nome      String
  descricao String? @db.Text

  inicio DateTime
  fim    DateTime

  /// "valor_liquido" | "valor_bruto" | "quantidade_contratos"
  metrica String

  /// Restringe quais linhas contam. null = todas do parceiro.
  tipoProduto String?

  metaGrupo     Decimal? @db.Decimal(14, 2)
  metaPorPessoa Decimal? @db.Decimal(14, 2)

  /// A RÉGUA DE PREMIAÇÃO, em degraus:
  ///   [{degrau:1, de:"0", ate:"50000", premio:"500.00", rotulo:"Bronze"},
  ///    {degrau:2, de:"50000", ate:null, premio:"1500.00", rotulo:"Ouro"}]
  /// Json pela mesma razão da escada: lida inteira, nunca filtrada entre
  /// campanhas.
  reguaPremiacao Json

  ativa Boolean @default(true)

  criadoPor    String?
  criadoEm     DateTime @default(now())
  atualizadoEm DateTime @updatedAt

  apuracoes CampanhaApuracao[]

  @@index([parceiroId, inicio])
  @@index([ativa, fim])
  @@index([empresaId])
}

model CampanhaApuracao {
  id String @id @default(cuid())

  campanhaId String
  campanha   CampanhaParceiro @relation(fields: [campanhaId], references: [id], onDelete: Cascade)

  pessoaId String
  pessoa   Pessoa @relation("ApuracaoDaPessoa", fields: [pessoaId], references: [id], onDelete: Restrict)

  realizado  Decimal @db.Decimal(14, 2)
  quantidade Int     @default(0)

  degrauAtingido Int?
  premioDevido   Decimal? @db.Decimal(14, 2)

  apuradoEm DateTime @default(now())

  /// CONGELAMENTO. Enquanto null, a linha é recalculada a cada leitura da
  /// tela. Preenchida, ninguém recalcula: o prêmio foi PAGO sobre este
  /// número, e um recálculo posterior mudaria o passado.
  congeladaEm DateTime?
  congeladaPor String?

  @@unique([campanhaId, pessoaId])
  @@index([campanhaId, realizado(sort: Desc)])
  @@index([pessoaId])
}
```

---

### 1.5 `LancamentoDespesa` — estrutura pronta, sem tela

Mínima de propósito: só o que torna o ROI possível depois, sem refatorar nada.

```prisma
model LancamentoDespesa {
  id String @id @default(cuid())

  /// MESMOS DOIS EIXOS da ParcelaReceita. É isso, e só isso, que faz o ROI
  /// futuro ser um JOIN em vez de uma reforma.
  empresaId String
  empresa   Empresa @relation(fields: [empresaId], references: [id], onDelete: Restrict)
  competencia String

  vencimento DateTime?
  categoria  String    // validada em código
  descricao  String?
  fornecedor String?

  valor  Decimal @db.Decimal(14, 2)
  status String  @default("prevista")

  fonte      String
  hashOrigem String? @unique

  criadoEm     DateTime @default(now())
  atualizadoEm DateTime @updatedAt

  @@index([empresaId, competencia, status])
  @@index([competencia])
}
```

**Tabela separada, não uma coluna `natureza` na `ParcelaReceita`.** Juntar as
duas obrigaria toda consulta de receita a carregar `WHERE natureza='receita'`,
e **esquecer isso uma vez soma despesa como se fosse receita** — que é
exatamente o erro do `receitaAnual` que acabamos de desfazer na #421, vestido
de roupa nova.

---

### 1.6 O que muda no que já existe

| tabela | o que acontece | por quê |
|---|---|---|
| `ContratoCorretora` | **renomeada** para `Contrato` + 7 colunas novas | é o molde que o próprio schema anuncia; renomear é `ALTER TABLE … RENAME`, barato **se vazia** |
| `PerfilImportacao` | **+1 coluna:** `destino String @default("contrato")` | o model foi feito ignorante da tabela de destino; agora há mais de um destino e o importador precisa saber qual. Validada em código |
| `ComissaoMensalCliente` | **aposentada** — `btg-enrich` passa a escrever `ParcelaReceita` | é a `ParcelaReceita` da Capital com outro nome: mesma competência `"AAAA-MM"`, mesmo `Decimal(14,2)`, mesma ideia de `fonte` na chave única. Manter as duas faria a Capital ser caso especial do consolidador para sempre |
| `ReceitaItem` | **marcada obsoleta**, `DROP` em PR seguinte | está vazia (medido na #409). Sua sucessora casa por FK; ela casa por **nome**, com fallback que aceita primeiro nome e atribui receita de um cliente à ficha de outro |
| `MetaMensal` | **+1 coluna:** `empresaId String?`, `@@unique` vira `[empresaId, mes, ano]` | hoje é global e só o painel semanal da Corretora a lê. Linhas existentes ficam com `null` = "meta do grupo". Aditiva, não quebra o painel |
| `ImportJob` | **nada** — reusada com `tipo = "receita_<empresa>"` | o campo já diz `"outros tipos no futuro"` |
| `Empresa`, `Pessoa`, `PessoaGrupo`, `Parceiro`, `ClienteBackoffice` | só lados inversos de relação | **nenhum SQL nessas tabelas** |

> **`MetaMensal.metaFaturamento` continua `Float`.** Trocar para `Decimal` numa
> coluna com dado vivo é migration de conversão, risco desproporcional ao ganho
> aqui. Fica registrado como dívida, não escondido.

---

## 2. Como o cronograma é gerado e projetado

**Módulo puro, sem IO** — o padrão que `escopo.ts`, `permissoes.ts` e
`rbac-papeis.ts` já usam neste repositório, e a razão de existir é poder testar
os três casos à mão sem banco.

```ts
// src/lib/financeiro/cronograma.ts
export function projetarParcelas(
  contrato: {
    inicioVigencia: Date; fimVigencia: Date | null;
    valorBase: Decimal | null; status: string; encerradoEm: Date | null;
  },
  regra: { tipo: string; periodicidade: string; quantidadeParcelas: number | null; escada: Degrau[] },
  horizonte: { ate: string },      // competência-limite, "AAAA-MM"
): ParcelaProjetada[]
```

Determinística, sem `now()` implícito, sem banco. A casca de IO faz o `upsert`
por `[contratoId, competencia, ordem, "projecao"]`.

**Quando roda:** ao criar/editar contrato, e num job noturno que reprojeta os
indefinidos (`quantidadeParcelas: null`) e reclassifica inadimplência.

**Horizonte:** `quantidadeParcelas` quando finito; **24 meses** rolantes quando
indefinido. Sem teto, "mensal até cancelar" geraria linhas até o fim dos tempos.

**Competência de cada degrau:** `inicioVigencia` + (ordem−1) × período.
Anual → +N anos. Mensal → +N meses. Sempre reduzido a `"AAAA-MM"`.

**Valor:** `percentual_por_parcela` → `valorBase × escada[ordem].percentual`;
`valor_por_parcela` → `escada[ordem].valor`; `percentual_fixo` → o mesmo
percentual todo mês.

### Os três casos, conferidos à mão (o critério objetivo)

**Seguro resgatável, 10 anos, `valorBase` R$ 12.000, régua decrescente**

| ordem | competência | percentual | valor |
|---|---|---|---|
| 1 | 2026-09 | 65,00% | 7.800,00 |
| 2 | 2027-09 | 12,00% | 1.440,00 |
| 3 | 2028-09 | 8,00% | 960,00 |
| … | … | … | … |
| 10 | 2035-09 | 1,00% | 120,00 |

Soma dos 10 = `valorBase × Σ percentuais`. **O teste é a soma**: se os
percentuais somam 100%, a projeção tem de fechar em R$ 12.000,00 exatos — e é
por isso que o campo é `Decimal`, não `Float`.

**Consórcio 8x, carta R$ 80.000, comissão 1,2% parcelada em 8**

8 linhas mensais de 2026-09 a 2027-04, R$ 120,00 cada, total R$ 960,00. A régua
muda por parceiro: outra `RegraReceita` com o mesmo `tipo` e outra escada.

**Plano de saúde: entrada R$ 900 + R$ 180/mês, indefinido**

ordem 1 = 2026-09, R$ 900,00. ordem 2 em diante = R$ 180,00, `repete: true`,
até o horizonte de 24 meses → 1 + 23 linhas. No 12º mês o job reprojeta e
estende.

---

## 3. Como cancelamento e inadimplência interrompem a projeção

Duas regras, e a primeira é a que protege o histórico:

**1. Nunca apagar. Cancelar.** Ao encerrar um contrato, as parcelas
`origem = "projecao"` com `competencia > competência do encerramento` passam a
`status = "cancelada"` — não são deletadas. Assim *"quanto deixamos de ganhar
com churn este ano"* é uma query, não uma arqueologia. Parcela já
`recebida` **nunca** é tocada.

**2. Inadimplência é da parcela, não do contrato.** Uma parcela `prevista` cuja
competência passou e que não tem `apuracao` correspondente após N dias vira
`status = "inadimplente"` — classificada pelo job noturno, persistida para a
tela filtrar barato. Se o pagamento entrar depois, a apuração chega e a linha
volta a fechar.

A diferença importa: **cancelamento para o futuro; inadimplência marca o
passado.** Um contrato pode ter três parcelas inadimplentes e seguir vigente.

*No seu vocabulário:* cancelamento é liquidar a posição — não há mais fluxo a
projetar. Inadimplência é cupom que não pingou — o papel continua na carteira,
e é justamente por isso que ele precisa aparecer marcado, não sumir.

---

## 4. Como a campanha apura por pessoa

```sql
SELECT p."pessoaId",
       sum(p."valorLiquido") AS realizado,
       count(*)              AS quantidade
  FROM "ParcelaReceita" p
  LEFT JOIN "Contrato" c ON c.id = p."contratoId"
 WHERE p."parceiroId"  = $campanha_parceiro
   AND p."competencia" BETWEEN $inicio AND $fim     -- "AAAA-MM", ordem lexicográfica = cronológica
   AND p."origem"      = 'apuracao'
   AND p."status"      = 'recebida'
   AND p."pessoaId" IS NOT NULL
   AND ($tipo_produto IS NULL OR c."tipoProduto" = $tipo_produto)
 GROUP BY 1
 ORDER BY 2 DESC;
```

**Só `origem = 'apuracao'` e `status = 'recebida'` contam.** Projeção não paga
prêmio. É o *stop loss* da apuração: sem essa linha, alguém cadastra um contrato
projetado em dezembro e "ganha" a campanha com dinheiro que ainda não entrou.

O prêmio sai de uma função pura sobre o Json:

```ts
// src/lib/financeiro/premiacao.ts
export function premioDe(regua: Degrau[], realizado: Decimal): { degrau: number; premio: Decimal } | null
```

**Visão de grupo por parceiro** = a mesma query sem `GROUP BY`, comparada a
`metaGrupo`. Uma consulta, dois recortes — a tela não tem dois caminhos de
número que possam divergir.

**Sem `pessoaId` a linha não apura.** É a lacuna a vigiar: parcela importada de
planilha que não casou com ninguém do time fica de fora da campanha em silêncio.
A tela precisa mostrar esse resto explicitamente — *"R$ X sem pessoa
atribuída"* —, senão a soma das pessoas nunca bate com o total do parceiro e
ninguém sabe por quê.

---

## 5. Como o consolidador Onix Co soma as 6

`onix-co-adm` já existe com `consolida: true`. A soma é uma recursão pela
árvore que **já está no banco**:

```sql
WITH RECURSIVE sob(id) AS (
  SELECT id FROM "Empresa" WHERE id = $raiz
  UNION ALL
  SELECT e.id FROM "Empresa" e JOIN sob s ON e."parentId" = s.id
)
SELECT r."empresaId", r."competencia",
       sum(r."valorLiquido") FILTER (WHERE r."origem" = 'apuracao'
                                       AND r."status" = 'recebida') AS realizado,
       sum(r."valorLiquido") FILTER (WHERE r."origem" = 'projecao'
                                       AND r."status" = 'prevista')  AS previsto
  FROM "ParcelaReceita" r
 WHERE r."empresaId" IN (SELECT id FROM sob)
   AND r."competencia" BETWEEN $de AND $ate
 GROUP BY 1, 2;
```

Porque Planejamento e Corporate são **departamentos da Corretora**, a receita
do seguro de 10 anos rola sozinha para dentro da Corretora e de lá para a
holding — sem regra especial.

> **Cuidado obrigatório:** `origem` na cláusula `FILTER`, sempre. Sem ela,
> projeção e apuração da mesma competência somam **as duas**, e o consolidador
> passa a mostrar receita dobrada. Isto entra como **teste**, não como comentário.

---

## 6. Onde a despesa entra quando chegar

`LancamentoDespesa` tem os mesmos dois eixos — `empresaId` e `competencia`. O
ROI é um `FULL OUTER JOIN` neles, e nada precisa ser refeito:

```sql
SELECT coalesce(r."empresaId", d."empresaId")   AS empresa,
       coalesce(r."competencia", d."competencia") AS competencia,
       coalesce(r.receita, 0) AS receita,
       coalesce(d.despesa, 0) AS despesa,
       coalesce(r.receita, 0) - coalesce(d.despesa, 0) AS resultado
  FROM (…receita por empresa/competência…) r
  FULL OUTER JOIN (…despesa por empresa/competência…) d
    ON r."empresaId" = d."empresaId" AND r."competencia" = d."competencia";
```

**É por isso que as abas se chamam "Receita" agora.** O nome muda quando a
segunda metade existir — chamar de ROI uma tela que só sabe o numerador é a
mesma classe de erro do "Receita anual" que mostrava renda declarada.

---

## 7. Ordem de execução — uma PR por frente

| # | frente | faixa | depende de |
|---|---|---|---|
| 1 | **Renomear as 5 abas ROI → Receita** | 🟡 | nada |
| 2 | **Migration** (4 tabelas novas, 2 alteradas, rename) | 🔴 | **seu ok no SQL** |
| 3 | **`cronograma.ts` + `premiacao.ts`** — módulos puros e testes | 🟢 | #2 |
| 4 | **Importação de receita** via `PerfilImportacao` + `ImportJob` | 🟡 | #2, #3 |
| 5 | **Tela ADM/Financeiro por empresa** | 🟡 | #4 |
| 6 | **Tela de campanhas** | 🟡 | #4 |
| 7 | **Consolidador Onix Co** | 🟡 | #5 |
| 8 | **`DROP ReceitaItem` + `DROP ComissaoMensalCliente`** | 🔴 | #4 rodado em produção uma vez |

A #1 não depende de nada e cabe hoje. Da #2 em diante, o gargalo é seu ok no
SQL — e o teto de WIP de 3 frentes vale aqui.

---

## 8. O que NÃO consigo verificar, e é preciso dizer

| afirmação | estado |
|---|---|
| `ReceitaItem` está vazia | ✅ **medido ao vivo** em 27/08 e de novo em 28/08 (`autorack.proxy.rlwy.net:24099/cockpit_onix`) |
| `ContratoCorretora` está vazia | ⚠️ **NÃO medido nesta sessão.** Cadeia lógica em `docs/onix-co-estado.md:668`, com a janela de 4 dias que ela mesma não cobre. O número chega na PR da migration |
| `ComissaoMensalCliente` tem quantas linhas | ⚠️ **não medido.** Decide se a aposentadoria precisa de backfill |
| `MetaMensal` tem quantas linhas | ⚠️ **não medido.** Decide o risco do `@@unique` novo |
| a migration aplica limpo | ⚠️ **não testado** — shadow-DB é gate da PR #2, não deste documento |

Sessão de agente não alcança o banco de produção (`CONNECT 403`). O caminho é o
`estado-do-banco.yml`, e o guarda por diff dele só dispara quando a PR toca o
script — o que a PR da migration fará, por construção.
