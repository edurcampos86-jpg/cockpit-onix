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
