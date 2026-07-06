import assert from "node:assert/strict";
import { test } from "node:test";

import { totalPatrimonioGravavel } from "./fatos-patrimonio.ts";

// 1b-2i — só número finito > 0 é gravável; 0/negativo = sentinela "não declarado".
test("totalPatrimonioGravavel — só número finito > 0", () => {
  assert.equal(totalPatrimonioGravavel(0), false);
  assert.equal(totalPatrimonioGravavel(-1), false);
  assert.equal(totalPatrimonioGravavel(Number.NaN), false);
  assert.equal(totalPatrimonioGravavel(undefined), false);
  assert.equal(totalPatrimonioGravavel(null), false);
  assert.equal(totalPatrimonioGravavel(4000000), true);
  assert.equal(totalPatrimonioGravavel(1), true);
});
