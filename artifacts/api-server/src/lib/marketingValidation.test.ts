import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL ||= "postgres://test:test@127.0.0.1:5432/test";
process.env.AWS_ENDPOINT_URL ||= "http://127.0.0.1:9000";
process.env.AWS_S3_BUCKET_NAME ||= "test";
process.env.AWS_ACCESS_KEY_ID ||= "test";
process.env.AWS_SECRET_ACCESS_KEY ||= "test";

test("business profile accepts missing optional fields and supports updates", async () => {
  const { businessBody } = await import("../routes/marketing");
  assert.deepEqual(businessBody.parse({ name: "Acme" }).name, "Acme");
  assert.equal(businessBody.parse({ name: "Acme 2", website: "" }).website, null);
  assert.equal(businessBody.safeParse({ name: "", website: "not-a-url" }).success, false);
});

test("brand kit accepts partial details and validates colors", async () => {
  const { brandBody } = await import("../routes/marketing");
  assert.equal(brandBody.safeParse({ voice: "Friendly" }).success, true);
  assert.equal(brandBody.safeParse({ primaryColor: "violet" }).success, false);
});

test("product create, update, and archive payloads validate", async () => {
  const { productBody } = await import("../routes/marketing");
  assert.equal(productBody.safeParse({ name: "Consultation", type: "service" }).success, true);
  assert.equal(productBody.partial().safeParse({ salePrice: "12.50" }).success, true);
  assert.equal(productBody.partial().safeParse({ active: false }).success, true);
  assert.equal(productBody.safeParse({ name: "Bad", type: "product", regularPrice: "-2" }).success, false);
});
