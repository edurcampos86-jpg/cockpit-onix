import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ANGULO_ENTRE_NOS_GRAUS,
  NOS_ECOSSISTEMA,
  posicaoOrbital,
} from "./nos";

test("o hub tem exatamente as 8 empresas do ecossistema, na ordem do protótipo", () => {
  assert.deepEqual(
    NOS_ECOSSISTEMA.map((n) => n.nome),
    [
      "Onix Capital",
      "Onix Agro",
      "Onix Corretora",
      "Onix Corporate",
      "Onix Imob",
      "Onix Tech",
      "Onix Educacional",
      "Onix Contábil",
    ],
  );
});

test("8 nós => 45° entre vizinhos", () => {
  assert.equal(NOS_ECOSSISTEMA.length, 8);
  assert.equal(ANGULO_ENTRE_NOS_GRAUS, 45);
});

test("os ids reaproveitam os de empresas-config — é por eles que o RBAC vai casar", () => {
  // Se algum destes mudar, o mapeamento empresa→permissão previsto em
  // acesso.ts deixa de casar silenciosamente.
  const ids = NOS_ECOSSISTEMA.map((n) => n.id);
  for (const id of ["investimentos", "corretora", "imobiliaria", "corporate", "tech", "educacao"]) {
    assert.ok(ids.includes(id), `id "${id}" sumiu do hub`);
  }
});

test("id de nó não se repete", () => {
  const ids = NOS_ECOSSISTEMA.map((n) => n.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("só as empresas sem rota em src/app/empresas/* nascem em construção", () => {
  assert.deepEqual(
    NOS_ECOSSISTEMA.filter((n) => n.emConstrucao).map((n) => n.id),
    ["agro", "educacao", "contabil"],
  );
});

test("todo nó aponta para uma rota absoluta", () => {
  for (const no of NOS_ECOSSISTEMA) {
    assert.match(no.href, /^\/[a-z0-9/-]+$/, `href inválido em "${no.id}": ${no.href}`);
  }
});

test("o primeiro nó fica às 12h", () => {
  // Y cresce para BAIXO em CSS, então o topo é fatorY = -1.
  assert.deepEqual(posicaoOrbital(0, 8), { fatorX: 0, fatorY: -1 });
});

test("a órbita anda no sentido horário", () => {
  const tresHoras = posicaoOrbital(2, 8); // 90° depois do topo
  assert.deepEqual(tresHoras, { fatorX: 1, fatorY: 0 });

  const seisHoras = posicaoOrbital(4, 8);
  assert.deepEqual(seisHoras, { fatorX: 0, fatorY: 1 });

  const noveHoras = posicaoOrbital(6, 8);
  assert.deepEqual(noveHoras, { fatorX: -1, fatorY: 0 });
});

test("resíduo de ponto flutuante não vaza para o CSS", () => {
  // Math.cos(Math.PI / 2) === 6.12e-17. Interpolado cru no calc() isso vira
  // "6.123233995736766e-17", notação que o CSS não aceita — a regra inteira
  // seria descartada e o nó colapsaria no centro.
  for (let i = 0; i < 8; i++) {
    const { fatorX, fatorY } = posicaoOrbital(i, 8);
    for (const fator of [fatorX, fatorY]) {
      assert.doesNotMatch(String(fator), /e/i, `fator em notação científica no índice ${i}`);
    }
  }
});

test("todo nó fica exatamente sobre a circunferência de raio 1", () => {
  for (let i = 0; i < NOS_ECOSSISTEMA.length; i++) {
    const { fatorX, fatorY } = posicaoOrbital(i);
    assert.ok(
      Math.abs(Math.hypot(fatorX, fatorY) - 1) < 1e-5,
      `nó ${i} saiu da circunferência`,
    );
  }
});
