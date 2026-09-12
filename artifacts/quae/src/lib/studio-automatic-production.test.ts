import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { CUSTOMER_RENDERING_MODELS } from "@workspace/plans";

const studioSource = () => readFile(new URL("../pages/studio/index.tsx", import.meta.url), "utf8");
const billingSource = () => readFile(new URL("../pages/studio/billing.tsx", import.meta.url), "utf8");

test("new customer videos use Quae's automatic LTX production profile", async () => {
  const source = await studioSource();
  assert.deepEqual(CUSTOMER_RENDERING_MODELS.map((model) => model.id), ["ltx-fast"]);
  assert.match(source, /const models = CUSTOMER_RENDERING_MODELS/);
  assert.match(source, /useState<string>\("ltx-fast"\)/);
  assert.match(source, /parsed\.modelId = "ltx-fast"/);
  assert.match(source, /if \(parsed\.step === 3\) parsed\.step = 4/);
});

test("billing prices only the models available in new customer production", async () => {
  const source = await billingSource();
  assert.match(source, /CUSTOMER_RENDERING_MODELS\.map/);
  assert.doesNotMatch(source, /(?:^|[^A-Z_])RENDERING_MODELS\.map/);
});

test("the customer journey skips the retired model-selection step", async () => {
  const source = await studioSource();
  assert.match(source, /Script Ready — Review Video/);
  assert.match(source, /onClick=\{\(\) => setStep\(4\)\}/);
  assert.match(source, /label: "Review & Render"/);
  assert.doesNotMatch(source, /\["Describe", "AI Script", "AI Model", "Render"\]/);
});

test("final customer confirmation describes production without exposing a provider", async () => {
  const source = await studioSource();
  assert.match(source, /Production:\s*<span/);
  assert.match(source, /Complete AI advertisement/);
  const finalReview = source.slice(source.indexOf("STEP 4 — Storyboard"));
  assert.doesNotMatch(finalReview, />Model<\/span>/);
});

test("product upload guidance stays provider neutral", async () => {
  const source = await studioSource();
  const describeStep = source.slice(source.indexOf("STEP 1 — Describe"), source.indexOf("STEP 2 — Script"));
  assert.match(describeStep, /Helps Quae create product-accurate scenes/);
  assert.match(describeStep, /Helps Quae create accurate scenes/);
  assert.doesNotMatch(describeStep, /LTX|Kling|provider/i);
});
