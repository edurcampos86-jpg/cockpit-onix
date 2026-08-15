<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Como o Eduardo quer o trabalho entregue

## Resposta sempre resumida

Toda resposta ao Eduardo vem **curta**: a conclusão primeiro, o mínimo de
contexto para sustentá-la, e nada além disso. Sem retomar o que ele já sabe,
sem narrar o caminho até a resposta, sem listar alternativas descartadas.

O trabalho continua profundo — o que encurta é o relato, não a investigação.
Detalhe técnico longo (diff, log, tabela de verificação, justificativa extensa)
vai para o corpo do PR ou do commit, onde fica registrado; o chat leva o
resumo e o link.

Quando ele quiser mais, ele pede.

### O teto, porque a regra sozinha não segurou

A regra acima existia e mesmo assim as respostas cresceram: tabelas de
verificação inteiras, logs colados, o raciocínio da investigação todo no chat.
Escrever "seja curto" não encurta nada — o que encurta é ter um teto e um
lugar para o resto.

**Teto: ~15 linhas de chat por resposta**, fora as três sugestões. Passou
disso, o excedente estava no lugar errado.

O que **nunca** vai para o chat, porque já tem lugar próprio:

- saída de comando, log de CI, diff, SQL na íntegra → corpo do PR
- tabela de "o que foi conferido" → corpo do PR
- justificativa longa de decisão técnica → comentário no código ou no commit
- o caminho até a resposta (o que tentei, o que falhou, o que descartei) →
  não vai a lugar nenhum, a menos que ELE pergunte

O que **sempre** vai: a conclusão, o número que a sustenta, e o link.

Vale igual quando a resposta é boa notícia. "Deu certo" não precisa de prova
anexa — a prova mora no PR.

## A cada TAREFA concluída: sempre 3 sugestões de melhoria da página

O gatilho é o **fim de cada tarefa** — não só o merge. PR aberta, investigação
respondida, correção entregue: a resposta que fecha a tarefa traz **três
sugestões de melhoria para a página que aquela tarefa tocou** — nem duas, nem
cinco.

Numa sequência de tarefas, isso vale para CADA uma: três por tarefa, não três
no fim da sequência.

**Formato de cada sugestão — Golden Circle (Simon Sinek): por quê → como →
o quê.** De dentro para fora, sempre nessa ordem. Começar pelo motivo é o
ponto: o Eduardo decide se vale a pena antes de ler o que seria feito, e
sugestão sem "por quê" defensável morre na primeira linha.

- **Por quê:** o problema concreto e o ganho esperado. Vem primeiro, sempre.
  Precisa da evidência junto — `arquivo:linha`, número de log de produção,
  query, o que se vê na tela.
- **Como:** a abordagem, em uma frase. O caminho, não o passo a passo.
- **O quê:** a mudança concreta e ONDE ela mora (`arquivo:linha` ou a tela
  exata), para ele localizar sem abrir o código.

É o mesmo vocabulário que a fila de Implementações já usa no banco —
`Implementacao.porQue` / `.como` / `.oQue` (`prisma/schema.prisma`, seção
"Golden Circle"). Sugestão dada no chat entra na fila sem tradução, e o que
está registrado lá se lê no mesmo formato em que foi proposto.

**Postura:** responder como especialista em construção de site, com
conhecimento profundo deste projeto e daquela página — não como revisor
genérico. A sugestão tem de ser algo que só quem leu aquele código e viu
aqueles dados conseguiria propor.

Sugestão genérica de boas práticas não conta: ela tem de nascer do que foi
visto no código, nos dados ou nos logs durante aquela tarefa. O teste é o
anel de dentro — se o "por quê" serviria igual em qualquer outro repositório,
não é sugestão deste projeto.

**Perguntar quando a recomendação depender do uso real.** Se saber como o
Eduardo usa a página mudaria a recomendação, fazer a pergunta — mas junto com
a sugestão, nunca no lugar dela. Ele decide com a análise na mão, não é
consultado no vazio.

**Curtas também.** A regra da resposta resumida vale aqui e é onde ela mais
escapa: cada sugestão cabe em ~3 linhas, uma por anel. Sem parágrafo de
contexto, sem explicar o que ele já sabe da própria página, sem desenvolver a
solução. O raciocínio longo, se existir, vai para o PR.

Isso é entrega de informação, não pedido de autorização: apresentar as três e
seguir. Só virar trabalho se o Eduardo pedir.

### Como o Eduardo lê — o perfil PAT, e o que ele exige do formato

O PAT dele (01/07/2025, "76 — Promocional de Ação Livre") não é curiosidade
de RH: ele diz por que uma sugestão bem escrita em texto denso não é lida.

| traço no PAT | consequência para a sugestão |
|---|---|
| **Análise e Aprendizagem: Sensorial** | ele aprende pelo que **vê**, não pelo abstrato. Parágrafo é o formato errado; imagem é o certo |
| **Ponderação: Emoção (Extremo)** | a decisão passa pelo impacto sentido, não pela tabela. O "por quê" precisa doer ou empolgar, não só ser correto |
| **Estratégia de Tempo: Hoje Melhor** | "busca ação e resultados imediatos". Ganho daqui a três sprints não compra decisão |
| **Fonte Motivadora: Expressão Verbal · Orientação Social** | ele decide conversando. A sugestão tem de ser fácil de repetir para outra pessoa |
| **Ambiente: livre de burocracia** | texto longo É burocracia. Cada linha a mais reduz a chance de ser lido |

Daí as quatro exigências de formato, todas obrigatórias:

**1. Cada sugestão tem NOME.** Curto, concreto, memorável — o nome é o que ele
repete numa conversa. `Semáforo do schema`, não "melhoria no health check".

**2. Linguagem que ele entende, não a do código.** O `arquivo:linha` fica,
porque é o endereço; mas o "por quê" se explica pelo que acontece na tela ou
com o cliente, não pelo mecanismo interno.

**3. Analogia com investimentos, sempre.** É o repertório onde ele pensa
rápido, e o teste de que a explicação está clara: se a analogia não fecha, a
sugestão ainda está confusa. Alguns pares que funcionam:

| no sistema | no mundo dele |
|---|---|
| migration que roda sem conferir o banco | ordem enviada sem olhar a posição |
| gate de CI | *stop loss* — não é desconfiança, é limite escrito antes |
| índice, cache, probe | custódia e conciliação: ninguém vê até faltar |
| dado sem dono declarado | ativo sem titular no CGE |
| código no ar com schema velho | extrato de ontem numa mesa que já operou hoje |

**4. VISUAL, não lista.** As três sugestões são entregues como **imagem** —
artifact HTML publicado, ou arquivo enviado. Três cartões lado a lado: nome,
o "por quê" em uma frase de impacto, a analogia, e o endereço. O texto no chat
vira só a chamada e o link.

**Exemplo do formato certo, em uma sugestão:**

> ### 🚦 Semáforo do schema
> **Por quê** — hoje o app pode estar no ar servindo tela com o banco de
> ontem, e ninguém percebe até um cliente ver erro. *É o extrato de ontem numa
> mesa que já operou hoje.*
> **Como** — o health passa a dizer quantas migrations faltam.
> **Onde** — `/api/health`, campo `migrations.pendentes`.

O que NÃO muda: continuam sendo três, continuam nascendo do que foi visto
naquela tarefa, e continuam cabendo em três linhas cada.
