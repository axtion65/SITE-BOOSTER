import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { API_SECURITY_HEADERS, setApiSecurityHeaders } from "./securityHeaders";

test("the API applies its complete browser security header baseline", () => {
  const applied = new Map<string, string>();
  setApiSecurityHeaders({
    setHeader(name, value) {
      applied.set(name, String(value));
      return this;
    },
  });

  assert.deepEqual(Object.fromEntries(applied), API_SECURITY_HEADERS);
});

test("security headers and fingerprint removal run before webhook routes", async () => {
  const source = await readFile(new URL("../app.ts", import.meta.url), "utf8");
  const disableFingerprint = source.indexOf('app.disable("x-powered-by")');
  const securityHeaders = source.indexOf("setApiSecurityHeaders(res)");
  const stripeWebhook = source.indexOf('app.post(\n  "/api/stripe/webhook"');

  assert.ok(disableFingerprint >= 0);
  assert.ok(securityHeaders > disableFingerprint);
  assert.ok(stripeWebhook > securityHeaders);
});
