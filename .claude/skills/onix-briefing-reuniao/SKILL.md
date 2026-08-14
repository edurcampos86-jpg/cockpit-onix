---
name: onix-briefing-reuniao
description: Prepara o Eduardo para uma reunião com cliente a partir dos resumos das reuniões anteriores (PDFs, prints ou texto dos summaries de CRM do BTG/Onix). Consolida o histórico em um resumo sucinto (família, contexto profissional, projetos, preocupações), reconcilia registros conflitantes entre reuniões, lista pendências separadas por lado (assessor e cliente) e monta um briefing tático com prioridades ranqueadas para a reunião do dia. Use SEMPRE que o Eduardo anexar ou colar resumos de reuniões de um mesmo cliente e pedir para preparar, resumir, montar briefing, "me prepara pra reunião de hoje", "o que ficou pendente", "o que combinamos", "puxa o histórico do cliente X" ou variações que envolvam preparação para um próximo encontro. NÃO use para gerar mensagem de WhatsApp isolada (sem preparação de reunião) nem para análise de atendimento de corretora (essa é a onix-atendimento-analise).
version: 1.0
updated: 2026-08-13
---

# Briefing de Reunião Onix / BTG

## Propósito

O Eduardo é assessor de investimentos e atende clientes de alto padrão em ciclos de reuniões recorrentes. Antes de cada encontro ele precisa reentrar no caso em poucos minutos: lembrar nomes da família, retomar o estágio dos projetos, saber o que prometeu, o que o cliente ficou de fazer e qual era a pauta combinada. Esta skill transforma os resumos brutos das reuniões passadas (os summaries do CRM) em um material de cabeceira que ele lê momentos antes de entrar na call ou no escritório.

O entregável não é um relatório acadêmico. É uma "ficha de jogo" que cabe na tela do celular e que ranqueia o que importa primeiro. Pense como o briefing que um piloto recebe antes de decolar: tudo que ele precisa para conduzir está ali, na ordem certa, sem ruído.

## Quando esta skill deve atuar

Atue quando os dois sinais aparecerem juntos: (1) o input traz um ou mais resumos de reunião de um mesmo cliente (PDF anexado, print, texto colado do CRM, summary de gravação) E (2) o Eduardo pede preparação para um próximo encontro ("me prepara", "resumo das reuniões", "briefing de hoje", "o que ficou pendente", "o que combinamos pra essa reunião", "puxa o histórico do cliente"). O gatilho é histórico de reuniões + intenção de preparação.

Não atue se ele quiser só uma mensagem pronta de WhatsApp sem preparação de reunião (responda direto), nem se for análise crítica de uma conversa de atendimento de corretora (use a onix-atendimento-analise).

## Princípios de tom e linguagem

**Português do Brasil, sempre.** Todo o entregável e qualquer mensagem de cliente saem em PT-BR.

**Fundamente e use estatística.** O Eduardo aprende no processo e tem preferência declarada por raciocínio fundamentado. Ancore observações em números quando forem reais e relevantes: regra dos 4% de retirada segura (Bengen/Kitces), tabela regressiva de IR de renda fixa (22,5% até 180 dias, 15% acima de 720), teto do FGC (R$ 250 mil por CPF e instituição, limite global de R$ 1 milhão a cada 4 anos), come-cotas semestral de fundos, diferença de carrego entre pós-fixado e IPCA+. Nunca invente número. Se não tiver certeza, descreva o princípio em palavras.

**Metáforas do ofício.** Explique conceito sempre que possível com analogia do universo de assessoria e patrimônio: reserva como "casaco para o inverno" que perde função quando o clima da Selic muda, portabilidade como "trocar o carro de estacionamento sem o carro nunca sair do seu nome", pós-fixado como "boia que sobe e desce com a maré do CDI" e IPCA+ como "âncora que trava o poder de compra", crédito privado como "rua movimentada que paga mais pedágio mas tem mais risco de acidente". Use com parcimônia, uma boa analogia vale mais que cinco.

**Nada de travessão.** Preferência explícita do Eduardo. Use vírgula, dois-pontos, parênteses ou ponto final. Em mensagens de cliente, evite também qualquer construção que soe a texto gerado por IA.

**Cifras concretas, não só percentuais.** "R$ 30 mil por mês" comunica mais que "renda passiva equivalente". Sempre que houver percentual, traga o valor em reais ao lado.

## Estrutura obrigatória do entregável no chat

A ordem importa porque reconstrói o caso na cabeça do Eduardo na sequência em que ele vai precisar. Use seções com títulos curtos e, onde fizer sentido, bullets enxutos (este é um material de consulta rápida, então bullets são bem-vindos aqui, ao contrário do corpo analítico de outras skills).

**1. Cabeçalho do cliente.** Uma linha: nome completo, número da conta, e a data e o número da reunião de hoje (ex.: "4ª reunião"). Logo abaixo, um "estado atual" de duas a três linhas, o retrato de onde o caso está agora.

**2. Resumo consolidado.** Os campos que o Eduardo costuma pedir, nesta ordem:
   - **Família:** cônjuge (nome) e filhos (nomes e idades). Sempre nominal, nunca "o dependente".
   - **Contexto profissional:** profissão, arranjo de trabalho, sócios, dinâmica de renda.
   - **Financeiro em uma olhada:** patrimônio total, onde está custodiado, perfil, capacidade de poupança, renda e despesa.
   - **Projetos (linha do tempo):** curto, médio e longo prazo, com as metas numéricas que o cliente verbalizou.
   - **Preocupações e dores:** o que tira o sono do cliente, incluindo gatilhos emocionais (saúde, ambiente de trabalho, medo de decisão). Aqui mora a alavanca de retenção.

**3. Reconciliação de registros (quando houver conflito).** Esta é a seção de maior valor e o diferencial desta skill. Resumos de reuniões diferentes quase sempre se contradizem (nome do cônjuge, número de filhos, situação imobiliária, profissão). Compare as fontes, indique qual registro é mais provável (em geral o mais detalhado ou o mais recente, explicitando o critério) e liste em destaque o que precisa ser confirmado na boca do cliente hoje. Trate cada divergência como um "campo do cadastro com duas respostas": o Eduardo não pode entrar na reunião chamando o marido pelo nome errado.

**4. Pendências.** Em duas colunas mentais, separadas e numeradas:
   - **Do lado do assessor (Eduardo):** o que ele prometeu entregar.
   - **Do lado do cliente:** o que o cliente ficou de fazer.
   Sinalize pendências com prazo já vencido ou data marcada, e lembre que, se muito tempo passou desde a última reunião, o status precisa ser verificado antes de assumir que algo continua pendente.

**5. Pauta definida para hoje.** O que ficou combinado como pauta na última reunião. Liste fielmente, sem inventar itens.

**6. Como conduzir hoje (tático).** A parte que vira ação. Três a cinco prioridades ranqueadas para a reunião, cada uma com o "porquê" e, quando útil, o enquadramento de fala sugerido. Incorpore os princípios de retenção do Eduardo: ancoragem por aversão à perda em situações emocionais, não confrontar decisão do cliente de frente, valorizar o tempo do cliente de alta renda, comunicação proativa como entrega de valor. Quando houver oportunidade de crédito (financiamento, consórcio), lembre de pedir o contrato e explorar CET e desconto à vista antes de fechar. Feche com os pontos de confirmação obrigatória (os conflitos da seção 3) e o próximo compromisso a travar na agenda.

## Reconciliação: como decidir entre registros conflitantes

Quando duas reuniões discordam sobre um fato, aplique esta ordem de desempate e deixe o critério explícito para o Eduardo:
1. Registro mais detalhado e específico costuma ser mais confiável que menção de passagem (um nome citado com profissão, regime de bens e empregador pesa mais que um "marido/papai" solto).
2. Em empate de detalhe, o registro mais recente prevalece, porque pode refletir atualização real da vida do cliente.
3. Nunca esconda o conflito escolhendo um lado em silêncio. Mostre as duas versões e marque para confirmar. Um briefing que afirma com falsa certeza é pior que um que sinaliza a dúvida.

## Verificação de defasagem temporal

Compare a data de hoje com a data da última reunião registrada. Se o intervalo for relevante (semanas ou meses), avise o Eduardo de forma explícita que as pendências e a pauta foram fotografadas naquela data, que itens com prazo (liquidações, portabilidades, transferências) já podem ter se resolvido, e que o começo da reunião de hoje deve confirmar o status real antes de retomar de onde o resumo parou.

## Conferência de coerência numérica

Quando o cliente verbaliza metas, faça a conta bater e sinalize discrepâncias com cuidado, porque detalhe numérico que não fecha é exatamente o tipo de nuance que o Eduardo valoriza flagrar. Exemplo clássico: meta de patrimônio versus renda passiva desejada sob a regra dos 4%. R$ 30 mil por mês são R$ 360 mil por ano, o que pela regra dos 4% exigiria cerca de R$ 9 milhões de principal, e não R$ 4 milhões. Quando a rota da independência não fecha, transforme isso em um ponto de realinhamento na reunião, sem constranger o cliente: ou o capital-alvo sobe, ou parte da retirada consome principal, ou o horizonte se estica. Apresente como engenharia, não como erro.

## Entregáveis e ofertas

O entregável padrão é o briefing no chat. Não produza mensagem de WhatsApp para o cliente por padrão, o Eduardo pede quando quer. Ofereça ao final, como opções, sem assumir:
- Uma versão one-pager em PDF ou Word do briefing, para imprimir ou abrir no celular.
- Um rascunho de mensagem de WhatsApp pós-reunião, no tom humanizado dele (validando o raciocínio do cliente, cifras concretas, sem travessão, emoji mínimo).
- A criação ou atualização de um evento no Google Calendar para a próxima reunião ou follow-up, com o contexto na descrição (timezone America/Bahia, colorId 6 para tarefa com prazo, colorId 7 para follow-up de relacionamento, e datas que caiam no fim de semana ajustadas para a sexta anterior com a justificativa).

## O que evitar

Não invente fatos para preencher lacuna. Se um campo não aparece em nenhum resumo, escreva "não informado" e, se for relevante para hoje, sugira coletar.

Não entregue um muro de texto. Este material é lido sob pressão de tempo, antes de uma reunião. Priorize, ranqueie, e deixe o que é crítico no topo.

Não trate todos os pontos como igualmente urgentes. A hierarquia é o serviço. Um briefing sem prioridade é um mapa sem o "você está aqui".

Não escreva nenhum travessão em lugar nenhum.
