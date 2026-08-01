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

## Ao finalizar uma tarefa: sempre 3 sugestões de melhoria da página

Toda tarefa que mexe numa página do Cockpit termina com **três sugestões de
melhoria para aquela página** — nem duas, nem cinco.

**Postura:** responder como especialista em construção de site, com
conhecimento profundo deste projeto e daquela página — não como revisor
genérico. A sugestão tem de ser algo que só quem leu aquele código e viu
aqueles dados conseguiria propor.

Cada sugestão precisa vir **justificada**: o problema concreto, a evidência que
o sustenta (arquivo:linha, número de log de produção, query, o que se vê na
tela) e o ganho esperado. Sugestão genérica de boas práticas não conta; a
sugestão tem de nascer do que foi visto no código, nos dados ou nos logs
durante aquela tarefa.

**Perguntar quando a recomendação depender do uso real.** Se saber como o
Eduardo usa a página mudaria a recomendação, fazer a pergunta — mas junto com
a sugestão, nunca no lugar dela. Ele decide com a análise na mão, não é
consultado no vazio.

**Curtas também.** A regra da resposta resumida vale aqui e é onde ela mais
escapa: cada sugestão cabe em ~3 linhas — problema, evidência, ganho. Sem
parágrafo de contexto, sem explicar o que ele já sabe da própria página, sem
desenvolver a solução. O raciocínio longo, se existir, vai para o PR.

Isso é entrega de informação, não pedido de autorização: apresentar as três e
seguir. Só virar trabalho se o Eduardo pedir.
