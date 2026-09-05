# Limites de upload — as cinco camadas

> Escrito depois de a **#400** declarar "quatro camadas conferidas, nenhuma ficou
> para trás" e faltar justamente a que decidia. Quem for mexer em teto de upload
> começa por aqui, não por `grep`.

Um arquivo enviado pelo navegador atravessa **cinco** tetos até virar registro.
O que barra é sempre o **menor** — e é comum que não seja o que está escrito na
tela.

## As cinco camadas, na ordem em que agem

| # | Camada | Onde se configura | Valor hoje | O que acontece ao estourar |
|---|---|---|---|---|
| 1 | **Corpo clonado pelo proxy** | `next.config.ts` → `experimental.proxyClientMaxBodySize` | **30 MB** | Corpo chega TRUNCADO. `Unexpected end of form` como `uncaughtException`, **fora** da action. 500 sem texto |
| 2 | **Body do Server Action** | `next.config.ts` → `experimental.serverActions.bodySizeLimit` | 55 MB | `ApiError 413` do Next, antes da action |
| 3 | **Guarda da aplicação** | o código de cada fluxo (tabela abaixo) | varia | Mensagem tratada na tela — **é a única camada que sabe explicar** |
| 4 | **Destino externo** | ex.: request da API Anthropic | 32 MB | Erro da API, capturado e transformado em mensagem |
| 5 | **Coluna do Postgres** | `@db.Text` | ~1 GB | Erro do Prisma, capturado |

### A regra que amarra tudo

> **A camada 3 tem de ser a MENOR de todas.**

Se qualquer teto de infraestrutura ficar abaixo da guarda do app, a mensagem
tratada vira inalcançável: o usuário leva crash em vez de explicação, e o log
mostra um erro do framework que não aponta para o nosso código.

Foi exatamente o que aconteceu com o PAT: guarda em 20 MB, proxy em 10 MiB.

## A camada 1 é a que ninguém lembra

Ela **só existe porque existe `src/proxy.ts`**. Com proxy no caminho, o Next
clona o corpo da requisição com limite próprio:

```
node_modules/next/dist/server/body-streams.js
  const DEFAULT_BODY_CLONE_SIZE_LIMIT = 10 * 1024 * 1024   // 10 MiB
```

E o matcher do proxy é `/((?!_next/static|_next/image|favicon.ico).*)` — ou seja,
**vale para tudo**, inclusive as rotas `/api/*`.

### ⚠️ O nome é armadilha

A mensagem de erro do Next cita `middlewareClientMaxBodySize`. Essa chave existe
no schema e **não é lida pelo runtime**. Quem vale é:

```
node_modules/next/dist/server/next-server.js:1274
  nextConfig.experimental.proxyClientMaxBodySize
```

**Reconferir essa linha a cada bump de versão do Next.** As duas chaves são
vizinhas no schema (`config-schema.js:273-274`); trocar uma pela outra produz
uma config que passa no build, passa no lint, e não faz nada.

## Guardas de aplicação, por fluxo

Levantado em 29/08/2026. Todo fluxo abaixo tem guarda própria — nenhum ficou
descoberto com o teto em 30 MB, e nenhum empata com ele.

| Guarda | Fluxo | Onde |
|---|---|---|
| 2 MB | foto do próprio cadastro | `actions/meu-cadastro.ts:86` |
| 8 MB | acordo comercial (2 pontos) | `actions/acordo-comercial.ts:56,132` |
| 8 MB | numerologia | `actions/numerologia.ts:38` |
| 10 MiB | anexo de sugestão | `lib/implementacoes/anexos.ts:18` |
| 15 MB | reunião do time | `actions/reuniao-time.ts:78` |
| **20 MB** | **laudo PAT** | `lib/pat-upload.ts:21` |
| 20 MB | import da corretora (3 rotas) | `api/empresas/corretora/importar/*` |
| 20 MB | contrato jurídico | `lib/juridico.ts:24` |
| 20 MB | extração por IA | `lib/importacao/extracao-ia.ts:49` |
| 25 MB | cockpit-reunião (2 rotas) | `api/cockpit-reuniao/{importar,extrair}` |
| 500 MB | ZIP de import jurídico | `api/admin/import-juridico-bulk/route.ts:21` |

### O que estava quebrado além do PAT

Com o proxy em 10 MiB, **todo fluxo com guarda acima disso morria do mesmo jeito**
— corpo truncado, 500 mudo, sem chegar à mensagem tratada:

- reunião do time acima de 10 MiB;
- import da corretora, contrato jurídico e extração por IA acima de 10 MiB;
- cockpit-reunião acima de 10 MiB;
- ZIP jurídico acima de 10 MiB (a guarda de 500 MB nunca foi alcançável);
- **anexo de sugestão exatamente no limite**: a guarda é 10 MiB e o proxy era
  10 MiB — o `bodySizeLimit` de 55 MB existe para "5 arquivos de 10 MB cada", e
  esse total nunca passou do proxy.

Nenhum desses tinha bug próprio. Todos herdavam o mesmo teto invisível.

### Por que 30 MB, e não 25

A primeira versão desta PR punha o proxy em 25 MB. O cockpit-reunião declara
exatamente **25 MB** — os dois ficavam **iguais**, e empate não satisfaz "a
camada 3 é a MENOR de todas": um PDF de exatamente 25 MB reencenaria ali o 500
mudo do PAT, com a regra parecendo cumprida no papel.

30 MB deixa o proxy **estritamente acima** da maior guarda do app, com 5 MB de
folga. É o mesmo motivo de não colocar o *stop* no preço exato da ordem.

> **Ao subir a guarda de qualquer fluxo, conferir este número ANTES.** Guarda
> nova ≥ 30 MB volta a quebrar em silêncio, sem log da aplicação.

## Como diagnosticar da próxima vez

1. **Log do Railway antes de teoria.** `Request body exceeded NMB for <rota>`
   seguido de `Unexpected end of form` é assinatura da camada 1, sempre.
2. **Server Action posta na URL da própria página.** No painel Rede do navegador
   a linha aparece com o caminho da tela e parece o GET dela. Confira o método:
   se é POST, o problema é envio, não render.
3. **Digest repetido entre builds não prova nada.** `Unexpected end of form` é
   erro interno do Next: mensagem e stack são estáveis, então o digest se repete
   mesmo com o build inteiro trocado.
