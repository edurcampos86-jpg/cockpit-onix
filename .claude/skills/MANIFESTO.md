# Manifesto das skills do método Onix

> **Arquivo GERADO. Não editar à mão.**
> Mudou qualquer arquivo de uma skill? Rode `./scripts/atualiza-manifesto.sh`
> e commite o resultado junto.

O `sha256` de **todo arquivo** de cada pasta de skill é conferido em toda PR
por `scripts/guarda-skills.sh` (step no `ci.yml`). Divergência reprova, e a
mensagem nomeia o arquivo.

**Por que o hash, e não só o `version`:** o campo `version` prova que
alguém escreveu um número; o hash prova QUAL conteúdo esse número nomeia. A
#327 ficou 25,1 h publicando a v2 no lugar da v2.2 — com o manifesto, aquele
arquivo teria reprovado no primeiro CI, e não 25 horas depois.

**Por que a pasta inteira, e não só o `SKILL.md`:** `story-fitness-onix`
traz `scripts/retoque_story.py`. Cobrir só o `SKILL.md` deixaria de fora
exatamente o tipo de arquivo cuja troca ninguém percebe numa revisão.

## Skills

| skill | version | updated |
|---|---|---|
| `backoffice-btg-onix` | 1.0 | 2026-08-13 |
| `create-prompt-onix` | 1.1 | 2026-09-05 |
| `instagram-carousel-onix` | 1.1 | 2026-09-05 |
| `onix-atendimento-analise` | 1.0 | 2026-08-13 |
| `onix-briefing-reuniao` | 1.0 | 2026-08-13 |
| `onix-entrega-segura` | 2.3 | 2026-08-14 |
| `orquestra-multiagente` | 1.0 | 2026-08-13 |
| `story-fitness-onix` | 1.0 | 2026-08-13 |

## Arquivos

Caminho relativo à pasta da skill.

| skill | arquivo | sha256 |
|---|---|---|
| `backoffice-btg-onix` | `SKILL.md` | `169d214544d1098a01f5455b6549f413a4bc72d89cd6e363a4076d7df5e529ba` |
| `create-prompt-onix` | `SKILL.md` | `69c985566cfc7258de2dcd6dfefbd584794e34df1391028af800d226c7081914` |
| `instagram-carousel-onix` | `SKILL.md` | `0e39295ab5f9212079c4f825ab6cdf8e2b583aacad71a495669c2a95e0aa9e37` |
| `onix-atendimento-analise` | `SKILL.md` | `8a232f0273724e7976983cd9b917a52a37b6157531dc197fd73b68903efc2397` |
| `onix-briefing-reuniao` | `SKILL.md` | `5b66d7f84b746d7e43a6b5c302f4fb7e779b8854e735167164675d41cf1dd3db` |
| `onix-entrega-segura` | `SKILL.md` | `ac0aac97c061c21eb08afa1337244ab0498b118802516bca68afb24dcc4f1b1d` |
| `orquestra-multiagente` | `SKILL.md` | `117021854ab38e1dd059991f81614f753edfffca8e3b0c5af9dd229b5e3e430c` |
| `story-fitness-onix` | `SKILL.md` | `97024fcec727017c443ed092f52aa73559ab4a556e2a8a3c776558554b68f83a` |
| `story-fitness-onix` | `scripts/retoque_story.py` | `4c1306c35ca799ddc9865f433c26efab56d00e2a1ba16c8468dbc6cb924b9d6e` |
