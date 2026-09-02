# Carrossel — "Tudo dá trabalho" (estilo post @eduardocampos86)

Releitura do post motivacional do Caio Carneiro no **layout dos posts do Eduardo Campos**:
fundo azul-marinho em gradiente (`#182433` → `#0A0E1A`), cabeçalho de perfil (avatar + nome +
selo verificado + @handle), título branco em caixa baixa, corpo em cinza, linha de **destaque
dourada** (`#C9A15C`) e botão **"Leia a legenda"**. Tipografia **Poppins**.

## Como gerar

```bash
node scripts/carrossel/gerar.mjs
```

As imagens (1080×1350, formato retrato Instagram 4:5) saem em `scripts/carrossel/out/`:
`slide-01.png` … `slide-05.png`.

Dependências (instaladas com `npm install --no-save`): `satori` (layout + fontes) e
`@resvg/resvg-js` (SVG → PNG). As fontes Poppins em TTF ficam em `fonts/`.

## Roteiro dos slides

1. "Tudo dá trabalho. E está tudo certo." — casa, família, cliente cobram dedicação
2. "Nada que importa se sustenta sozinho."
3. "Reclamar do peso só trava você."
4. "A rotina desgasta." — desgaste é sinal de movimento
5. Fechamento — "É sinal de vida em movimento." + destaque dourado + botão "Leia a legenda"

## Legenda sugerida

> Tudo dá trabalho. E tá tudo certo.
>
> Casa dá trabalho. Família dá trabalho. Cliente dá trabalho. Tudo que tem valor cobra dedicação, e nada que importa se sustenta no automático.
>
> O que para de receber cuidado começa a se desfazer caladinho. Aí é fácil cair na armadilha de reclamar de cada coisa que exige a sua entrega. Só que viver reclamando do que importa é o caminho mais curto pra frustração.
>
> A rotina cansa mesmo. Mas cansaço é sinal de movimento. Quem não carrega nada nunca cansa, e também não constrói nada.
>
> Então da próxima vez que bater aquele peso, lembra: ele não é castigo. É a prova de que tem coisa boa nas suas costas, coisa que vale a pena. 🖤
>
> Salva esse post pra reler num dia difícil. E me conta aqui embaixo: o que tem te dado mais trabalho (e mais orgulho) ultimamente?
>
> .
> .
> #mentalidade #altaperformance #disciplina #rotina #propósito #empreendedorismo #gestãodepatrimônio #onixcapital
