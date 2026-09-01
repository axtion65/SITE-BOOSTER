import test from "node:test";
import assert from "node:assert/strict";
import { isNativeClipLength, nativeClipLength, RENDERING_MODELS } from "@workspace/plans";

test("every production model exposes its provider scene limit and accepts full advert lengths", () => {
  const expected = { "ltx-fast": "10s", kling: "10s" } as const;
  assert.deepEqual(Object.fromEntries(RENDERING_MODELS.map(model => [model.id, nativeClipLength(model.id)])), expected);

  for (const model of RENDERING_MODELS) {
    for (const supported of ["15s", "30s", "45s"]) assert.equal(isNativeClipLength(model.id, supported), true);
    for (const unsupported of ["5s", "10s", "60s", "90s", "120s", "180s"]) {
      assert.equal(isNativeClipLength(model.id, unsupported), false, `${model.id} must reject ${unsupported}`);
    }
  }
});
