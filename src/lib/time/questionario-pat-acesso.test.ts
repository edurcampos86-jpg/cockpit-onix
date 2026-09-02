import assert from "node:assert/strict";
import test from "node:test";
import {
  podeAcessarQuestionarioPat,
  type ContextoAcessoQuestionarioPat,
} from "./questionario-pat-acesso";

function contexto(
  role: string,
  pessoa: ContextoAcessoQuestionarioPat["pessoa"] = null,
): ContextoAcessoQuestionarioPat {
  return { role, pessoa };
}

test("master acessa qualquer pessoa, mesmo sem Pessoa vinculada", () => {
  assert.equal(
    podeAcessarQuestionarioPat(contexto("master"), { lideradoPorId: "lider-1" }),
    true,
  );
});

test("responsável direto acessa seu liderado", () => {
  assert.equal(
    podeAcessarQuestionarioPat(
      contexto("support", { id: "lider-1", teamRole: "lideranca" }),
      { lideradoPorId: "lider-1" },
    ),
    true,
  );
});

test("admin comum não direto não acessa", () => {
  assert.equal(
    podeAcessarQuestionarioPat(
      contexto("admin", { id: "admin-1", teamRole: "admin" }),
      { lideradoPorId: "lider-1" },
    ),
    false,
  );
});

test("liderança alheia, a própria pessoa e usuário sem Pessoa não acessam", () => {
  assert.equal(
    podeAcessarQuestionarioPat(
      contexto("support", { id: "lider-2", teamRole: "lideranca" }),
      { lideradoPorId: "lider-1" },
    ),
    false,
  );
  assert.equal(
    podeAcessarQuestionarioPat(
      contexto("support", { id: "pessoa-1", teamRole: "colaborador" }),
      { lideradoPorId: "lider-1" },
    ),
    false,
  );
  assert.equal(
    podeAcessarQuestionarioPat(contexto("support"), { lideradoPorId: null }),
    false,
  );
});

