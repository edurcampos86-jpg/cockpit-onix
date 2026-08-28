import { test } from "node:test";
import assert from "node:assert/strict";
import { isAdmin, isAdminMaster, isLideranca, type PerfilAcesso } from "./rbac-papeis";

const perfil = (p: Partial<PerfilAcesso> = {}): PerfilAcesso => ({
  role: "support",
  pessoa: null,
  ...p,
});

/* ── ADMIN MASTER ──────────────────────────────────────────────────────── */

test("master pelo papel no banco", () => {
  assert.equal(isAdminMaster(perfil({ role: "master" })), true);
});

test("master pelo e-mail — o fallback de bootstrap", () => {
  // Enquanto o `UPDATE User SET role='master'` não rodou, é ele que evita o
  // lockout. Sem quebra-vidro, era a única forma de a ordem não importar.
  assert.equal(isAdminMaster(perfil({ role: "admin", email: "edurcampos86@gmail.com" })), true);
  assert.equal(isAdminMaster(perfil({ role: "support", email: "edurcampos86@gmail.com" })), true);
});

test("o fallback normaliza caixa e espaço — o cadastro não garante nenhum dos dois", () => {
  assert.equal(isAdminMaster(perfil({ email: "  EduRcampos86@Gmail.COM " })), true);
});

test("e-mail vazio ou ausente NUNCA vira master", () => {
  // O ponto que mais convida ao acidente: `AuthContext.email` cai para "" quando
  // o User não é encontrado. Se a comparação fosse frouxa, todo contexto sem
  // e-mail viraria Admin Master.
  assert.equal(isAdminMaster(perfil({ email: "" })), false);
  assert.equal(isAdminMaster(perfil({ email: null })), false);
  assert.equal(isAdminMaster(perfil()), false);
  assert.equal(isAdminMaster(perfil({ email: "   " })), false);
});

test("admin comum não é master — é exatamente esta linha que separa os poderes", () => {
  assert.equal(isAdminMaster(perfil({ role: "admin" })), false);
  assert.equal(isAdminMaster(perfil({ role: "admin", pessoa: { teamRole: "admin" } })), false);
  assert.equal(isAdminMaster(perfil({ role: "admin", email: "outra.pessoa@onix.com" })), false);
});

/* ── MASTER É SUPERCONJUNTO ────────────────────────────────────────────── */

test("master passa em isAdmin — senão criar o papel TIRARIA acesso", () => {
  // São 76 chamadas de `isAdmin` no sistema. Se o master não passasse aqui,
  // promover alguém a master o rebaixaria em todas elas de uma vez.
  assert.equal(isAdmin(perfil({ role: "master" })), true);
  assert.equal(isAdmin(perfil({ role: "support", email: "edurcampos86@gmail.com" })), true);
});

test("master passa em isLideranca, pela mesma razão", () => {
  assert.equal(isLideranca(perfil({ role: "master" })), true);
});

/* ── O QUE NÃO MUDOU ───────────────────────────────────────────────────── */

test("as duas formas antigas de ser admin continuam valendo", () => {
  assert.equal(isAdmin(perfil({ role: "admin" })), true);
  assert.equal(isAdmin(perfil({ pessoa: { teamRole: "admin" } })), true);
});

test("colaborador continua fora de tudo", () => {
  const colaborador = perfil({ pessoa: { teamRole: "colaborador" }, email: "alguem@onix.com" });
  assert.equal(isAdminMaster(colaborador), false);
  assert.equal(isAdmin(colaborador), false);
  assert.equal(isLideranca(colaborador), false);
});

test("liderança continua sendo liderança, e não vira admin nem master", () => {
  const lider = perfil({ pessoa: { teamRole: "lideranca" } });
  assert.equal(isLideranca(lider), true);
  assert.equal(isAdmin(lider), false);
  assert.equal(isAdminMaster(lider), false);
});
