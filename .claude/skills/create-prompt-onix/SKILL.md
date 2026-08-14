---
name: create-prompt-onix
description: Estrutura qualquer pedido, ideia ou prompt do Eduardo no método CREATE (Context, Request, Examples, Audience, Task, Extra Details), o framework de prompt do Time de Capacitação do BTG Pactual, com duas versões de Context (identidade Onix fixa ou molde genérico reutilizável). Skill de acionamento INTENCIONAL: nunca dispara sozinha. Use SOMENTE quando o Eduardo pedir explicitamente para estruturar, montar ou organizar algo no formato CREATE, com gatilhos como "monta um CREATE", "estrutura esse pedido", "estrutura esse prompt", "aplica o método CREATE", "usa o CREATE", "transforma isso em CREATE", "passa pro CREATE", "CREATE Onix" ou "CREATE genérico". Quando acionada, devolve o prompt estruturado pronto para colar e reutilizar, e executa a tarefa em seguida se ele pedir.
version: 1.0
updated: 2026-08-13
---

# Método CREATE ➜ Onix

## Propósito

O Eduardo é assessor e sócio na Onix Capital (afiliada BTG Pactual, registrada na CVM), com 19 anos de mercado, em Salvador. No dia a dia ele dispara dezenas de pedidos ao Claude: rascunhar pitch, montar pergunta consultiva, resumir relatório, criar post, tratar objeção. O problema clássico é o mesmo de uma ordem mal preenchida na mesa de operações: quando o pedido entra cru, o Claude "executa no preço errado" e gasta três ou quatro turnos só corrigindo rota.

Esta skill é o boleto de ordem padronizado dele. Ela pega a ideia bruta e a organiza nos seis campos do CREATE antes da execução, de modo que o primeiro output já saia calibrado. O ganho é de eficiência operacional: o custo de contexto, que hoje se paga turno a turno, passa a ser pago uma vez, no preenchimento da estrutura.

O CREATE é o framework de prompt do Time de Capacitação do BTG. Esta skill traduz esse framework para a realidade da Onix e o deixa reutilizável.

## Quando atuar (e quando NÃO atuar)

Esta é uma skill de acionamento intencional. Ela funciona como uma ordem limitada, não a mercado: só executa quando o Eduardo aciona o gatilho de propósito.

**Atue quando** ele pedir explicitamente para estruturar algo no formato: "monta um CREATE pra...", "estrutura esse pedido", "passa isso pro CREATE", "aplica o método CREATE", "usa o CREATE Onix", "me dá um CREATE genérico disso", ou variações claras.

**Não atue** em pedidos comuns do dia a dia, mesmo que sejam tarefas que caberiam num CREATE. Se ele só diz "escreve um post sobre NTN-B", responda direto, sem montar a estrutura. A skill não deve transformar todo pedido num formulário, isso travaria o fluxo dele. O gatilho é a menção ao CREATE ou a um sinônimo direto de "estruturar o pedido".

## Os seis blocos do CREATE

Conduza o preenchimento sempre nesta ordem. A ordem importa porque constrói o briefing do raso ao específico, igual a uma diligência de cliente que vai do perfil geral até a alocação tática.

**C ➜ Context.** Quem é o Eduardo, sua atuação, e o leque de produtos e soluções que ele cobre (investimentos, banking, soluções). É o pano de fundo permanente. Aqui entram as duas versões descritas na seção seguinte.

**R ➜ Request.** O papel que o Claude assume e o tipo de entrega esperada: criar, alterar, ajustar, resumir ideias, materiais, infográficos, perguntas, histórias, pitchs, objeções, relatórios, posts, podcasts. É a definição do "para que" o Claude está sendo contratado nesta sessão.

**E ➜ Examples.** Referências concretas: anexos, posts antigos, um modelo de mensagem que funcionou, o tom de uma peça anterior. Few-shot é o que mais move a agulha na qualidade do output. Se não houver exemplo, registre "sem exemplo de referência" em vez de deixar em branco.

**A ➜ Audience.** Para quem, ou sobre quem, é a entrega. Perfil, faixa etária, momento de vida ou de carteira, cidade, contexto do relacionamento (prospect de evento, cliente antigo, equipe interna).

**T ➜ Task.** A tarefa específica e concreta desta vez. É o único campo que muda em quase toda sessão. Deve ser acionável e ter um entregável claro (uma tabela de perguntas, um pitch de 40 segundos, três variações de post).

**E ➜ Extra Details.** Tom, restrições e o que evitar. Padrão Onix: tom sóbrio, profissional e consultivo, sem viés de vendas, sem perguntas autocentradas ou fechadas, linguagem executiva e orientada ao cliente. Sem travessão. Em copy de WhatsApp e Instagram, use ➜ no lugar do travessão.

## Context ➜ as duas versões

Quando a skill é acionada, ofereça ou aplique uma das duas versões abaixo. Se o Eduardo não especificar, use a Versão A (Onix) por ser o uso dominante dele, e avise em uma linha que dá para trocar pela genérica.

### Versão A ➜ Onix (fixa)

Use este bloco como Context sempre que a tarefa for do universo Onix. Ele dispensa o Eduardo de reescrever quem é a cada chat:

> Sou Eduardo Rodrigues Campos, assessor de investimentos e sócio da Onix Capital, escritório afiliado ao BTG Pactual e registrado na CVM, baseado em Salvador, Bahia, com 19 anos de mercado. Lidero um time e atendo uma base de mais de 2.600 clientes sob as marcas Blindagem Patrimonial e Meu Sucesso Patrimonial. Conduzo conversas consultivas com base em perguntas estratégicas, abertas e intencionais, que geram valor genuíno para o cliente, mapeando necessidades e objetivos. Atuo em investimentos (Renda Fixa, Renda Variável, Fundos de Investimento, COE), banking (conta transacional e cartão de crédito) e soluções (crédito, seguro de vida, offshore, câmbio). Atuo também como assessor sênior de seguros.

### Versão B ➜ Genérica (molde)

Use este molde quando o Eduardo quiser estruturar um CREATE fora do contexto Onix (outro papel, um teste, ou algo para compartilhar com a equipe ou com terceiros). Preencha os colchetes:

> Sou [NOME], atuando como [PAPEL] em [EMPRESA / CONTEXTO], em [CIDADE / PRAÇA]. Minha atuação se baseia em [PILAR / FILOSOFIA DE ATENDIMENTO]. Atendo [PERFIL DE PÚBLICO]. Ofereço [PRODUTOS / SOLUÇÕES].

## Como conduzir quando a skill é acionada

1. **Identifique o modo.** "Monta / me dá / escreve um CREATE" significa que ele quer o prompt estruturado como entregável, para colar, guardar ou reaproveitar. "Resolve isso usando CREATE" ou "estrutura e já executa" significa que ele quer o resultado da tarefa, com a estruturação acontecendo nos bastidores.

2. **Escolha o Context.** Onix (Versão A) por padrão, genérico (Versão B) se ele pedir ou se a tarefa não for do universo Onix.

3. **Preencha o que der, sinalize o que falta.** Infira Request, Audience e Task a partir do que ele deu. Onde faltar informação crítica (tipicamente Audience ou Examples), marque com `[PREENCHER: ...]` em vez de inventar. Não interrogue: faça no máximo uma pergunta, e só se a lacuna inviabilizar a entrega.

4. **Entregue em bloco copiável.** Quando o modo for "montar o prompt", devolva o CREATE preenchido dentro de um bloco de código, para ele copiar inteiro de uma vez.

5. **Feche com a ponte.** Pergunte se ele quer que você já execute a Task com aquele CREATE, ou execute direto se ele já tiver pedido.

## Princípios de tom e linguagem

Sem travessão em nenhuma entrega. Use vírgula, dois-pontos, parênteses ou ponto final. Em copy de WhatsApp e Instagram, o substituto é ➜.

Padrão de tom Onix em qualquer Task: sóbrio, profissional, consultivo, executivo, orientado ao cliente, sem viés de vendas. Em perguntas consultivas, nada de perguntas fechadas ou autocentradas.

Fundamente. Quando explicar uma escolha de estrutura, ancore no porquê e, quando couber, use analogias do universo de mercado financeiro e seguros, que é o repertório que ressoa com ele. Não invente estatística: se não tiver o número, descreva o princípio.

## Template preenchível (copiável)

```
[C] Context
{Versão A Onix fixa, ou Versão B genérica preenchida}

[R] Request
Você atuará como {papel do Claude nesta sessão}, me auxiliando a {criar / alterar / ajustar / resumir} {tipo de material}.

[E] Examples
{Referências, anexos ou modelos. Se não houver: "sem exemplo de referência".}

[A] Audience
{Para quem / sobre quem: perfil, faixa, cidade, momento de carteira, tipo de relacionamento.}

[T] Task
{A tarefa específica e o entregável concreto desta vez.}

[E] Extra Details
Tom sóbrio, profissional e consultivo, sem viés de vendas, linguagem executiva e orientada ao cliente. Sem travessão. {Restrições adicionais.}
```

## Exemplo de referência (caso Carla, adaptado Onix)

Mostra o framework aplicado, com o Context já na identidade real da Onix em vez do "Arthur Investimentos" do material do BTG:

```
[C] Context
Sou Eduardo Rodrigues Campos, assessor e sócio da Onix Capital (afiliada BTG Pactual,
registrada na CVM), em Salvador, com 19 anos de mercado. Conduzo conversas consultivas
com perguntas estratégicas, abertas e intencionais. Atuo em investimentos (RF, RV,
Fundos, COE), banking (conta e cartão) e soluções (crédito, seguro de vida, offshore, câmbio).

[R] Request
Você atuará como meu assistente, me auxiliando a criar perguntas consultivas para a
primeira reunião com uma prospect.

[E] Examples
Sem exemplo de referência nesta sessão.

[A] Audience
Carla, prospect, empresária de 35 anos, residente em Salvador, que conheci em um evento
na semana passada.

[T] Task
Crie uma tabela de perguntas intencionais, exploratórias e consultivas para a primeira
reunião, a fim de coletar informações e prestar um atendimento personalizado e de alto nível.

[E] Extra Details
Tom sóbrio, profissional e consultivo, sem viés de vendas, sem perguntas autocentradas
ou fechadas. Sem termos agressivos. Linguagem executiva e orientada ao cliente. Sem travessão.
```

## O que evitar

Não acione a skill em pedido comum sem gatilho explícito. O valor dela está em ser intencional, não onipresente.

Não deixe campos em branco silenciosamente. Campo vazio é ordem incompleta. Preencha, sinalize com `[PREENCHER]`, ou registre "sem exemplo".

Não use travessão, nem a palavra travessão, em nenhuma entrega.

Não invente estatística para parecer fundamentado. Descreva o princípio quando não tiver o número.

Não troque a identidade real da Onix pelo exemplo genérico do material do BTG. "Arthur Investimentos" é só o caso de aula; o Context fixo é Onix Capital.
