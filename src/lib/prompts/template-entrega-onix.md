<!--
  TEMPLATE-MÃE do prompt de execução gerado pela Central de Implementações.

  Este arquivo é a FONTE DA VERDADE da metodologia. Ele existe separado do
  código React de propósito: ajustar a metodologia (gates, lembretes, ordem das
  seções) é editar este .md — não mexe em componente nem exige raciocínio novo
  da IA. O montador (montar-prompt-entrega.ts) só substitui placeholders.

  REGRAS DE EDIÇÃO
  - Placeholders são `{{NOME}}` em CAIXA ALTA. Todo placeholder usado aqui
    precisa existir no montador, senão o teste `template-entrega-onix.test.ts`
    quebra (ele varre o .md e confere a cobertura).
  - Blocos opcionais (anexo, contexto da IA, lembretes) chegam já prontos ou
    vazios; quando vazios, a linha inteira some (o montador colapsa em branco).
  - Ao mudar a metodologia, suba o VERSAO abaixo. Ela vai gravada junto do
    promptGerado, então dá pra saber com qual régua cada prompt foi produzido.

  VERSAO: 1
-->
# {{TITULO}}

> **Onde rodar:** Claude Code (não Claude Chat), em `~/dev/cockpit-onix`, em branch criada a partir da `main` atualizada.
> **Metodologia obrigatória:** `/onix-entrega-segura` — PRs faseadas (uma preocupação por PR), gates de lint e build antes de cada PR, **parada obrigatória antes do merge** aguardando "ok" explícito. Os gates que valem para esta tarefa estão em "Lembretes técnicos", abaixo.
{{LINHA_ORQUESTRA}}

## Contexto

- **Empresa/departamento:** {{EMPRESA}}
- **Tipo:** {{TIPO}}
- **Página de origem:** {{PAGINA}}

## O quê

{{O_QUE}}

## Como

{{COMO}}

## Por quê

{{POR_QUE}}

{{BLOCO_ELICITACAO}}
{{BLOCO_ANEXOS}}
## Lembretes técnicos do projeto

{{LEMBRETES}}

## Entregável esperado

1. Auditar o código existente antes de criar qualquer coisa nova (RBAC, upload, integração com IA) — não duplicar o que já existe.
2. Plano de PRs: quantas, o que cada uma cobre, em que ordem.
3. A primeira PR aberta em **draft**, com o diff devolvido para revisão — sem merge.
4. Três sugestões de melhoria para a página tocada.
