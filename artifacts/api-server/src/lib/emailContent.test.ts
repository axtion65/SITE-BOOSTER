import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { escapeHtml, normalizeEmailSubject } from "./emailContent";

test("customer text is escaped before entering email markup", () => {
  assert.equal(
    escapeHtml(`<img src=x onerror="alert('x')"> & goodbye`),
    "&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt; &amp; goodbye",
  );
});

test("email subjects cannot contain header-breaking controls or grow without bound", () => {
  assert.equal(
    normalizeEmailSubject("  Ready\r\nBcc: attacker@example.com\u0000  now  "),
    "Ready Bcc: attacker@example.com now",
  );
  assert.equal(normalizeEmailSubject("\r\n"), "Quae.ai update");
  assert.equal(normalizeEmailSubject("a".repeat(250)).length, 200);
});

test("every untrusted email field uses the content safety boundary", () => {
  const email = readFileSync(new URL("./email.ts", import.meta.url), "utf8");
  const admin = readFileSync(new URL("../routes/admin.ts", import.meta.url), "utf8");

  assert.match(email, /subject: normalizeEmailSubject\(subject\)/);
  assert.match(email, /subject: normalizeEmailSubject\(subject\), html/);
  assert.match(email, /escapeHtml\(firstName\)/);
  assert.match(email, /escapeHtml\(projectTitle\)/);
  assert.match(email, /escapeHtml\(message\)/);
  assert.doesNotMatch(admin, /Broadcast sent[^\n]*subject/);
});
