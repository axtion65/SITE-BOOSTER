import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

type Session = {
  user: { isAdmin: boolean } | null;
  token: string | null;
  isLoading: boolean;
  isSessionError: boolean;
  isRetryingSession: boolean;
  retrySession: () => void;
};

// Render the actual guards with only their browser hooks replaced. No server,
// account, credentials, or provider requests are needed for these failure states.
const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../components/auth-guard.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

function loadGuards(overrides: Partial<Session> = {}) {
  const session: Session = {
    user: null,
    token: "saved-session",
    isLoading: false,
    isSessionError: true,
    isRetryingSession: false,
    retrySession: () => {},
    ...overrides,
  };
  const effects: Array<() => void> = [];
  const destinations: string[] = [];
  const module = { exports: {} as Record<string, React.FC<React.PropsWithChildren>> };
  const fixtures: Record<string, unknown> = {
    react: { ...React, useEffect: (effect: () => void) => effects.push(effect) },
    "@/hooks/use-auth": { useAuth: () => session },
    wouter: { useLocation: () => ["/studio", (path: string) => destinations.push(path)] },
    "@/lib/campaign-templates": { protectedSignInUrl: () => "/signin" },
    "@/components/ui/spinner": { Spinner: () => React.createElement("span", { role: "status" }, "Loading") },
  };
  new Function("require", "module", "exports", "window", compiled)(
    (name: string) => Object.hasOwn(fixtures, name) ? fixtures[name] : require(name),
    module,
    module.exports,
    { location: { pathname: "/studio", search: "" } },
  );
  const render = (name: "RequireAuth" | "RequireAdmin") => renderToStaticMarkup(
    React.createElement(module.exports[name], null, React.createElement("p", null, "Protected workspace")),
  );
  return { session, effects, destinations, guards: module.exports, render };
}

function findButton(node: React.ReactNode): React.ReactElement<any> | undefined {
  if (!React.isValidElement<any>(node)) return undefined;
  if (node.type === "button") return node;
  if (typeof node.type === "function") return findButton((node.type as React.FC<any>)(node.props));
  for (const child of React.Children.toArray(node.props.children)) {
    const button = findButton(child);
    if (button) return button;
  }
  return undefined;
}

for (const guard of ["RequireAuth", "RequireAdmin"] as const) {
  test(`${guard} explains an exhausted session lookup without exposing protected content`, () => {
    const fixture = loadGuards();
    const html = fixture.render(guard);
    assert.match(html, /We couldn’t reconnect to your account/);
    assert.match(html, /role="alert"/);
    assert.match(html, /Try again/);
    assert.doesNotMatch(html, /Protected workspace/);
    fixture.effects.forEach((effect) => effect());
    assert.deepEqual(fixture.destinations, []);
    assert.equal(fixture.session.token, "saved-session");
  });
}

test("the recovery button invokes the supplied session retry once", () => {
  let attempts = 0;
  const fixture = loadGuards({ retrySession: () => { attempts++; } });
  const button = findButton(fixture.guards.RequireAuth({ children: "Protected workspace" }));
  assert.ok(button);
  assert.equal(button.props.disabled, false);
  button.props.onClick();
  assert.equal(attempts, 1);
  assert.equal(fixture.session.token, "saved-session");
});

test("a pending reconnection disables the retry button and reports progress", () => {
  const fixture = loadGuards({ isRetryingSession: true });
  const html = fixture.render("RequireAuth");
  assert.match(html, /<button[^>]*disabled=""[^>]*aria-busy="true"/);
  assert.match(html, /Reconnecting…/);
});

test("a resolved customer session opens the workspace and retains admin access checks", () => {
  const customer = loadGuards({ user: { isAdmin: false }, isSessionError: false });
  assert.match(customer.render("RequireAuth"), /Protected workspace/);
  assert.equal(customer.render("RequireAdmin"), "");
  customer.effects.forEach((effect) => effect());
  assert.deepEqual(customer.destinations, ["/studio"]);
  const admin = loadGuards({ user: { isAdmin: true }, isSessionError: false });
  assert.match(admin.render("RequireAdmin"), /Protected workspace/);
});

test("an expired session redirects to sign-in without offering network recovery", () => {
  for (const guard of ["RequireAuth", "RequireAdmin"] as const) {
    const fixture = loadGuards({ token: null, isSessionError: false });
    assert.equal(fixture.render(guard), "");
    fixture.effects.forEach((effect) => effect());
    assert.deepEqual(fixture.destinations, ["/signin"]);
  }
});

test("the initial session lookup shows loading instead of a premature recovery error", () => {
  const fixture = loadGuards({ isLoading: true, isSessionError: false });
  const html = fixture.render("RequireAuth");
  assert.match(html, /Loading/);
  assert.doesNotMatch(html, /Try again|Protected workspace/);
});
