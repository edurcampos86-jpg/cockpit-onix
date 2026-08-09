import assert from "node:assert/strict";
import { test } from "node:test";
import { versaoDeploy } from "./versao-deploy";

const CHAVES = [
  "RAILWAY_GIT_COMMIT_SHA",
  "RAILWAY_GIT_BRANCH",
  "RAILWAY_ENVIRONMENT_NAME",
  "RAILWAY_DEPLOYMENT_ID",
] as const;

/** Roda `fn` com o env montado, e devolve o env ao estado anterior depois. */
function comEnv(valores: Partial<Record<(typeof CHAVES)[number], string>>, fn: () => void) {
  const antes = Object.fromEntries(CHAVES.map((k) => [k, process.env[k]]));
  try {
    for (const k of CHAVES) {
      const v = valores[k];
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    fn();
  } finally {
    for (const k of CHAVES) {
      const v = antes[k];
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

test("fora do Railway tudo é null — nunca string vazia", () => {
  // Um "" no lugar de null faria o workflow comparar contra vazio e passar
  // achando que conferiu alguma coisa.
  comEnv({}, () => {
    assert.deepEqual(versaoDeploy(), {
      sha: null,
      shaCurto: null,
      branch: null,
      ambiente: null,
      deploymentId: null,
    });
  });
});

test("sha curto tem 7 caracteres, no formato de `git log --oneline`", () => {
  comEnv({ RAILWAY_GIT_COMMIT_SHA: "0982a7fdd51b6680eafde57126c8e24dbe9310ce" }, () => {
    const v = versaoDeploy();
    assert.equal(v.shaCurto, "0982a7f");
    assert.equal(v.shaCurto?.length, 7);
    assert.equal(v.sha, "0982a7fdd51b6680eafde57126c8e24dbe9310ce");
  });
});

test("sha mais curto que 7 não quebra nem é preenchido", () => {
  comEnv({ RAILWAY_GIT_COMMIT_SHA: "abc" }, () => {
    assert.equal(versaoDeploy().shaCurto, "abc");
  });
});

test("branch e ambiente saem como vieram", () => {
  comEnv(
    {
      RAILWAY_GIT_BRANCH: "main",
      RAILWAY_ENVIRONMENT_NAME: "production",
      RAILWAY_DEPLOYMENT_ID: "dep_123",
    },
    () => {
      const v = versaoDeploy();
      assert.equal(v.branch, "main");
      assert.equal(v.ambiente, "production");
      assert.equal(v.deploymentId, "dep_123");
    },
  );
});

test("vazio, espaço e 'unknown' contam como ausente", () => {
  // Railway preenche algumas dessas variáveis com literal vazio quando o
  // deploy não veio de git (redeploy manual, restore). Tratar como valor faria
  // o smoke comparar contra lixo.
  comEnv({ RAILWAY_GIT_COMMIT_SHA: "", RAILWAY_GIT_BRANCH: "   " }, () => {
    const v = versaoDeploy();
    assert.equal(v.sha, null);
    assert.equal(v.shaCurto, null);
    assert.equal(v.branch, null);
  });
  comEnv({ RAILWAY_ENVIRONMENT_NAME: "unknown" }, () => {
    assert.equal(versaoDeploy().ambiente, null);
  });
  comEnv({ RAILWAY_ENVIRONMENT_NAME: "UNKNOWN" }, () => {
    assert.equal(versaoDeploy().ambiente, null);
  });
});

test("valor é relido a cada chamada, não congelado no módulo", () => {
  // O Railway injeta em runtime; uma constante de módulo guardaria o valor do
  // build e mentiria em todo deploy seguinte.
  comEnv({ RAILWAY_ENVIRONMENT_NAME: "staging" }, () => {
    assert.equal(versaoDeploy().ambiente, "staging");
  });
  comEnv({ RAILWAY_ENVIRONMENT_NAME: "production" }, () => {
    assert.equal(versaoDeploy().ambiente, "production");
  });
});
