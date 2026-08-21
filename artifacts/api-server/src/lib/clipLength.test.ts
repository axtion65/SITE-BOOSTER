import test from "node:test";
import assert from "node:assert/strict";
import { isNativeClipLength, nativeClipLength, RENDERING_MODELS } from "@workspace/plans";

test("every catalogue model accepts only its truthful native single-render length", () => {
  const expected = { "ltx-fast": "5s", veo3: "8s", ovi: "10s", wan: "10s", kling: "10s" } as const;
  assert.deepEqual(Object.fromEntries(RENDERING_MODELS.map(model => [model.id, nativeClipLength(model.id)])), expected);

  for (const model of RENDERING_MODELS) {
    assert.equal(isNativeClipLength(model.id, expected[model.id]), true);
    for (const unsupported of ["15s", "30s", "45s", "60s", "90s", "120s", "180s"]) {
      assert.equal(isNativeClipLength(model.id, unsupported), false, `${model.id} must reject ${unsupported}`);
    }
  }
});
