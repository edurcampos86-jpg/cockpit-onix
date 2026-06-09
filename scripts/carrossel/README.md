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

> Tudo dá trabalho. Casa, família, cliente — tudo exige dedicação.
> Se você reclamar de cada peso, vai viver em frustração constante.
> Mas tem outro jeito de enxergar: a rotina desgasta porque você está em movimento.
> Peso é sinal de que você está carregando algo que vale a pena. 🖤
>
> Salve esse post pra lembrar nos dias pesados.
>
> #OnixCapital #Mentalidade #Rotina #AltaPerformance
