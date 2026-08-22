# Plano 🟡 — a prioridade de fonte declarada não é aplicada

> **NÃO IMPLEMENTADO.** Documento para decisão. Nenhuma linha de política foi
> alterada nesta rodada.

## 1. O bug

`src/lib/backoffice/field-source-policy.ts:16-18` declara, por escrito:

> "Quando há sobreposição […] a lista é **ORDENADA pela prioridade** — primeiro
> = mais autoritativo."

`upsertPorPolitica` (`src/lib/backoffice/upsert-cliente.ts:54-74`) confere
**apenas pertinência**:

```ts
if (!fontesPermitidas.includes(fonte)) { /* bloqueia */ }
```

Não existe comparação de índice em lugar nenhum. **Última escrita vence.** A
ordem da lista é documentação sobre um comportamento que o código não tem.

**Não é a causa do incidente do Saldo D0** — o Eduardo sobe a planilha depois das
9h BRT e o cron roda 06:29, então a planilha escreveria por último e venceria
mesmo com o bug. Mas é bug real: basta o cron atrasar, ser reexecutado à tarde,
ou o Eduardo importar de manhã cedo, para a planilha perder em silêncio.

## 2. Quantos campos estão expostos

**7 de 67** campos da policy declaram mais de uma fonte:

| campo | fontes, na ordem declarada |
|---|---|
| `saldoConta` | `saldo_em_cc` → **`api`** |
| `cpfCnpj` | `informacoes` → `base_btg` → **`api`** |
| `nomeCompleto` | `informacoes` → **`api`** |
| `perfilInvestidor` | `informacoes` → **`api`** |
| `suitabilityValidoAte` | `informacoes` → **`api`** |
| `telefone` | `informacoes` → **`api`** |
| `email` | `informacoes` → **`api`** |

**Os 7 têm `api` como fonte de MENOR prioridade — e `api` é a única que roda
sozinha, em cron.** Todo campo com prioridade declarada está exposto à inversão,
e o vencedor indevido é sempre o mesmo. Não é coincidência: a policy foi escrita
quando só havia planilha, e a API entrou depois, por baixo.

Os outros 60 campos têm fonte única e são imunes por construção.

`saldoConta` sofre com o cron diário (`btg-balances-poll`, 09:00 UTC); os outros
6, com o cadastral semanal (`btg-cadastral-poll`).

## 3. O conserto

Três linhas de decisão dentro de `upsertPorPolitica`, antes do filtro atual:

```ts
const idxFonte = fontesPermitidas.indexOf(fonte);
const carimbo = existente?.fonteUltimoUpdate?.[campo];      // "fonte:ISO8601"
const fonteAnterior = carimbo?.split(":")[0] as FonteImport | undefined;
const idxAnterior = fonteAnterior ? fontesPermitidas.indexOf(fonteAnterior) : Infinity;

// Índice MENOR = mais autoritativo. Fonte de menor autoridade não sobrescreve
// o que uma de maior autoridade escreveu — a não ser que o valor esteja velho.
if (idxFonte > idxAnterior && !venceuPorIdade(carimbo)) {
  camposBloqueados.push({ campo, motivo: `${fonte} não sobrescreve ${fonteAnterior}` });
  continue;
}
```

### A janela de validade é obrigatória, não opcional

Prioridade pura cria um pior problema: se o Eduardo parar de subir a planilha por
duas semanas, `saldoConta` **congela** — a API fica eternamente bloqueada por um
carimbo de 30/07. Dado velho de fonte autoritativa é pior que dado fresco de
fonte secundária.

Daí `venceuPorIdade`: passado o prazo, a fonte de menor prioridade volta a poder
escrever.

| campo | prazo sugerido | por quê |
|---|---|---|
| `saldoConta` | **24 h** | saldo de ontem já é informação errada |
| cadastrais (os outros 6) | **30 dias** | mudam raramente; a Base é mais completa |

Os prazos entram como constante no mesmo arquivo da policy, sobrescritíveis por
`Config` no padrão de `import-sanity.ts` — para ajustar sem deploy.

## 4. O que o teste precisa cobrir

`upsertPorPolitica` hoje não tem teste. A parte com regra sai para um módulo puro
(`decidirEscrita(campo, fonte, carimboAnterior, agora)`), no padrão de
`contador-import.ts`, com estes casos:

- fonte de maior prioridade sobrescreve a de menor — sempre;
- fonte de menor prioridade **não** sobrescreve dentro do prazo;
- fonte de menor prioridade **volta a escrever** passado o prazo (anti-congelamento);
- carimbo ausente (campo nunca escrito) → qualquer fonte permitida escreve;
- carimbo corrompido (sem `:`) → trata como ausente, **não** bloqueia;
- mesma fonte sempre sobrescreve a si mesma.

O quinto é o que evita transformar um bug de dado num bug de disponibilidade.

## 5. Ordem recomendada

1. **Primeiro o recibo do import** (esta PR) — sem saber se o import grava, mexer
   na prioridade muda o comportamento de um caminho que ninguém está medindo.
2. Depois `decidirEscrita` + testes, com flag OFF.
3. Só então ligar, começando por `saldoConta` (24 h), que é o de prazo mais curto
   e portanto o de menor risco de congelar.

Ligar a prioridade antes do passo 1 seria consertar no escuro exatamente o
sistema cujo instrumento acabou de faltar.
