import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("customer-owned product and logo previews have meaningful descriptions", () => {
  const products = readFileSync(new URL("../pages/studio/products.tsx", import.meta.url), "utf8");
  const brandKit = readFileSync(new URL("../pages/studio/brand-kit.tsx", import.meta.url), "utf8");

  assert.match(products, /alt=\{`\$\{p\.name\} product image`\}/);
  assert.match(products, /alt=\{`\$\{editing\.name \|\| 'Product'\} \$\{image\.role\} image`\}/);
  assert.match(brandKit, /alt=\{i\?'Secondary logo preview':'Primary logo preview'\}/);
});
