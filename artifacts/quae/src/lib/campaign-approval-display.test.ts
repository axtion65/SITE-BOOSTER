import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import * as campaignTemplates from "./campaign-templates";
import { customerCopy } from "./customer-copy";

const require = createRequire(import.meta.url);
const compiledPages = Object.fromEntries(["campaigns", "campaign-detail"].map(name => [name,
  ts.transpileModule(readFileSync(new URL(`../pages/studio/${name}.tsx`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText,
]));
const panel = ({ children }: React.PropsWithChildren) => React.createElement("div", null, children);
const pill = ({ children }: React.PropsWithChildren) => React.createElement("span", null, children);

// Render the real pages with saved API response fixtures. Effects are disabled,
// so these approval transitions cannot start a campaign or a paid provider call.
function loadPage(name: string, states: unknown[]) {
  let stateIndex = 0;
  const module = { exports: {} as Record<string, any> };
  const fixtures: Record<string, unknown> = {
    react: { ...React, useEffect: () => {}, useState: (initial: any) => {
      const value = stateIndex < states.length ? states[stateIndex] : typeof initial === "function" ? initial() : initial;
      stateIndex++;
      return [value, () => {}];
    } },
    wouter: {
      Link: ({ href, children }: any) => React.createElement("a", { href }, children),
      useLocation: () => ["/studio/campaigns", () => {}],
      useRoute: () => [true, { id: "campaign-1" }],
    },
    "./marketing-shared": { MarketingPage: panel, PremiumCard: panel, StatusPill: pill, fieldClass: "field" },
    "@/components/quae-design-system": {
      ActionButton: ({ children, ...props }: any) => React.createElement("button", props, children),
      StatusPill: pill, EmptyState: panel,
    },
    "@/components/ui/dialog": { Dialog: ({ open, children }: any) => open ? children : null,
      DialogContent: panel, DialogDescription: panel, DialogHeader: panel, DialogTitle: panel },
    "@/hooks/use-toast": { useToast: () => ({ toast: () => {} }) },
    "@/lib/campaign-templates": campaignTemplates,
    "@/lib/customer-copy": { customerCopy },
    "./campaigns": name === "campaign-detail" ? loadPage("campaigns", []) : {},
  };
  new Function("require", "module", "exports", "window", compiledPages[name])(
    (id: string) => Object.hasOwn(fixtures, id) ? fixtures[id] : require(id),
    module, module.exports, { location: { search: "" } },
  );
  return module.exports;
}

function workspace(overrides: Record<string, unknown> = {}) {
  return {
    id: "campaign-1", name: "Saved campaign", brief: { objective: "Introduce our offer" },
    status: "approved", approved_run_id: "run-1", reviewState: "valid", nextAction: "create_visual",
    runs: [{ id: "run-1", status: "ready_for_review", final_result: {
      isFallback: true,
      finalScript: { title: "Our offer", hook: "Explore our offer.", script: "Our exact approved words.", callToAction: "Learn more" },
    } }],
    ...overrides,
  };
}

function renderWorkspace(data: ReturnType<typeof workspace>) {
  const page = loadPage("campaign-detail", [null, false, data]);
  return renderToStaticMarkup(React.createElement(page.default));
}

test("saved approval replaces the repeat approval prompt and preserves exact approved copy", () => {
  const html = renderWorkspace(workspace());
  assert.match(html, /Campaign Approved/);
  assert.match(html, /role="status"[^>]*>[\s\S]*?Approval saved/);
  assert.match(html, /Our exact approved words\./);
  assert.match(html, /Continue to Creative/);
  assert.match(html, /REQUEST CHANGES/);
  assert.match(html, /It did not pass Quae’s full quality review/);
  assert.doesNotMatch(html, /Approve Campaign|Ready for your review|Customer review required/);
});

test("an unapproved draft still requires customer approval", () => {
  const html = renderWorkspace(workspace({ status: "ready_for_review", approved_run_id: null }));
  assert.match(html, /Approve Campaign/);
  assert.match(html, /Ready for your review/);
  assert.match(html, /Customer review required/);
  assert.doesNotMatch(html, /Approval saved|Continue to Creative/);
});

test("a newer draft cannot inherit a previous run's approved display", () => {
  const html = renderWorkspace(workspace({ approved_run_id: "older-run" }));
  assert.match(html, /Approve Campaign/);
  assert.doesNotMatch(html, /Approval saved|Continue to Creative/);
});

test("a source mismatch does not display an approval or approval button", () => {
  const html = renderWorkspace(workspace({ reviewState: "needs_rebuild" }));
  assert.doesNotMatch(html, /Approval saved|Continue to Creative|Approve Campaign/);
});

test("campaign list prioritizes saved approval while retaining pending and failed states", () => {
  const campaigns = [
    { id: "approved", name: "Approved offer", status: "approved", latest_run_status: "ready_for_review" },
    { id: "pending", name: "Pending offer", status: "ready_for_review", latest_run_status: "ready_for_review" },
    { id: "failed", name: "Failed offer", status: "failed", latest_run_status: "failed" },
  ];
  const page = loadPage("campaigns", [false, campaigns, null, [], false, "loading"]);
  const html = renderToStaticMarkup(React.createElement(page.default));
  for (const [id, label] of [["approved", "Campaign Approved"], ["pending", "Ready for your review"], ["failed", "Failed"]]) {
    const card = html.match(new RegExp(`<a href="/studio/campaigns/${id}">([\\s\\S]*?)</a>`))?.[1];
    assert.ok(card);
    assert.ok(card.includes(label));
  }
});
