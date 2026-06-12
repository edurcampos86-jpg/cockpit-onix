/**
 * `server-only` é um alias interno do compilador do Next — não existe em
 * node_modules. Pra rodar smoke tests de libs server com tsx puro, este
 * shim resolve o import pra um módulo vazio (este próprio arquivo).
 *
 * Uso: NODE_OPTIONS="--require ./scripts/shims/server-only-shim.cjs" npx tsx <script>
 */
const Module = require("module");
const orig = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  if (request === "server-only") return __filename;
  return orig.call(this, request, ...args);
};
