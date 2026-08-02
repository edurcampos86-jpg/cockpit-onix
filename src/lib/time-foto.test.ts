import assert from "node:assert/strict";
import { test } from "node:test";

import { chaveFotoPessoa, tipoImagem } from "./time-foto.ts";

// ── chaveFotoPessoa: a trava que impede alcançar objeto de outra pessoa.

test("chave fica sempre sob o prefixo time/foto/", () => {
  assert.equal(chaveFotoPessoa("abc123"), "time/foto/abc123");
  assert.ok(chaveFotoPessoa("qualquer").startsWith("time/foto/"));
});

test("mesma pessoa, mesma chave — trocar a foto sobrescreve", () => {
  // Se a chave variasse por upload, o bucket acumularia uma foto morta por
  // troca, e a rota não saberia qual servir.
  assert.equal(chaveFotoPessoa("abc123"), chaveFotoPessoa("abc123"));
});

// ── tipoImagem: assinatura dos formatos aceitos.

test("PNG é reconhecido", () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.equal(tipoImagem(png), "image/png");
});

test("JPEG é reconhecido", () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
  assert.equal(tipoImagem(jpeg), "image/jpeg");
});

test("WEBP é reconhecido (RIFF....WEBP)", () => {
  const webp = Buffer.concat([
    Buffer.from("RIFF", "ascii"),
    Buffer.from([0, 0, 0, 0]),
    Buffer.from("WEBP", "ascii"),
  ]);
  assert.equal(tipoImagem(webp), "image/webp");
});

test("RIFF que não é WEBP não vira imagem", () => {
  // WAV também começa com RIFF. Sem checar os bytes 8-12, um áudio sairia
  // rotulado como imagem.
  const wav = Buffer.concat([
    Buffer.from("RIFF", "ascii"),
    Buffer.from([0, 0, 0, 0]),
    Buffer.from("WAVE", "ascii"),
  ]);
  assert.equal(tipoImagem(wav), "application/octet-stream");
});

test("conteúdo desconhecido vira octet-stream, não imagem", () => {
  assert.equal(tipoImagem(Buffer.from("nada disso")), "application/octet-stream");
});

test("buffer curto demais não estoura", () => {
  for (const b of [Buffer.alloc(0), Buffer.from([0xff]), Buffer.from([0x89, 0x50])]) {
    assert.equal(tipoImagem(b), "application/octet-stream");
  }
});
