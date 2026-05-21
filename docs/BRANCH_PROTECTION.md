# Branch Protection — Cockpit Onix

Instruções manuais para configurar a proteção da branch `main` no GitHub.
Este arquivo documenta a configuração; **a aplicação é manual no painel
do GitHub** porque branch protection não é versionada como código no
plano Free (precisaria de GitHub Enterprise + rulesets via API).

## Onde configurar

`Settings → Branches → Branch protection rules → Add rule`

## Configuração recomendada para `main`

Em `Branch name pattern`: `main`

### Marque as seguintes opções

- [x] **Require a pull request before merging**
  - [x] Require approvals: **1**
  - [x] Dismiss stale pull request approvals when new commits are pushed
  - [x] Require review from Code Owners _(usa o `.github/CODEOWNERS`)_
  - [ ] Restrict who can dismiss pull request reviews _(deixe desmarcado — solo dev)_
  - [ ] Require approval of the most recent reviewable push _(opcional)_

> **Por que exigir review em solo dev?** Força você a abrir o diff no
> GitHub UI antes de mergear — isso pega coisas que o terminal não pega
> (arquivo gigante esquecido, secret commitado, etc.). Custa 30s.

- [x] **Require status checks to pass before merging**
  - [x] Require branches to be up to date before merging
  - Status checks que devem passar:
    - `smoke / smoke` _(do `post-deploy-smoke.yml` — adicionar após o 1º run pra aparecer na lista)_
    - Qualquer check de build que você adicionar no futuro (ex.: `eslint`, `tsc`)

> **Atenção:** o `post-deploy-smoke.yml` hoje roda **contra produção**,
> não contra a PR. Para usar como required check, precisaria de um
> workflow separado tipo `pr-build.yml` que roda `npm run build` em
> matrix da PR (sugestão pra fase 2). Por enquanto, deixar só os checks
> que você efetivamente quer bloquear.

- [x] **Require conversation resolution before merging**

- [x] **Require signed commits** _(opcional mas recomendado — configurar
      sua GPG/SSH signing key primeiro)_

- [x] **Require linear history** _(evita merge commits — força rebase/squash)_

- [x] **Do not allow bypassing the above settings**
  - Aplica regras inclusive a admins (= a você)

### Block

- [x] **Allow force pushes:** **Specify who can force push: ninguém**
  - Combinado com "Require linear history", impede reescrever histórico
    público.
- [x] **Allow deletions:** **desmarque**

### Não marque

- [ ] **Lock branch** _(isso impede commits novos — não é o que queremos)_
- [ ] **Restrict pushes that create matching branches** _(não relevante)_

## Validação após configurar

Tente fazer isso e confirme que falha:

```bash
# 1. Tentar push direto na main (deve falhar):
git checkout main
git commit --allow-empty -m "test"
git push origin main
# → ! [remote rejected] main -> main (protected branch hook declined)

# 2. Tentar force push (deve falhar):
git push --force origin main
# → ! [remote rejected] main -> main (force push not allowed)

# 3. Tentar deletar main (deve falhar):
git push origin --delete main
# → ! [remote rejected] main (deletion of the current branch prohibited)
```

E o caminho feliz (que continua funcionando):

```bash
git checkout -b feature/algo
# faça mudanças
git commit -m "feat: ..."
git push -u origin feature/algo
# abre PR → pede approval (você mesmo aprova) → merge
```

## Sobre rulesets (alternativa moderna)

Em vez de branch protection rules clássicas, o GitHub agora oferece
**Rulesets** (Settings → Rules → Rulesets). Vantagens:

- Pode ser exportado/importado como JSON
- Aplica a múltiplos padrões de branch
- API mais consistente

Para nós, branch protection clássica resolve. Se quiser migrar pra
ruleset depois, exporte usando:

```bash
gh api repos/edurcampos86-jpg/cockpit-onix/rulesets > ruleset.json
```

## Última revisão da configuração

| Data | Quem | O que mudou |
|------|------|-------------|
| _aguardando primeira configuração_ | — | — |
