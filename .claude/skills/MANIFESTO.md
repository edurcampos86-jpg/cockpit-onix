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
| `create-prompt-onix` | 1.0 | 2026-08-13 |
| `instagram-carousel-onix` | 1.0 | 2026-08-13 |
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
| `create-prompt-onix` | `SKILL.md` | `2c66c0d0082d9b1101cae1eb369d68f1c2d092ce47560384e6e49421dacbd6e5` |
| `instagram-carousel-onix` | `SKILL.md` | `73edc4513c6c5d5c3fbef279d9869c70597735bafe398b93302b5d5fb0ae5f52` |
| `onix-atendimento-analise` | `SKILL.md` | `8a232f0273724e7976983cd9b917a52a37b6157531dc197fd73b68903efc2397` |
| `onix-briefing-reuniao` | `SKILL.md` | `5b66d7f84b746d7e43a6b5c302f4fb7e779b8854e735167164675d41cf1dd3db` |
| `onix-entrega-segura` | `SKILL.md` | `048c617f7a26197397118028d6d9f5c3fe521eeb74614090766e45ee66228502` |
| `orquestra-multiagente` | `SKILL.md` | `117021854ab38e1dd059991f81614f753edfffca8e3b0c5af9dd229b5e3e430c` |
| `story-fitness-onix` | `SKILL.md` | `97024fcec727017c443ed092f52aa73559ab4a556e2a8a3c776558554b68f83a` |
| `story-fitness-onix` | `scripts/retoque_story.py` | `4c1306c35ca799ddc9865f433c26efab56d00e2a1ba16c8468dbc6cb924b9d6e` |
