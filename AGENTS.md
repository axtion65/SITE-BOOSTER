# BDB execution rules for SITE-BOOSTER

This repository is production software for Quae.ai. Frontend production is Vercel. Backend production is Railway.

The operating rule is:

**ROOT CAUSE → ONE FIX → VERIFY → STOP**

Do not turn one bug into a sequence of guesses, rewrites, duplicate PRs, or repeated customer tests.

## Before any edit

1. Start from the latest remote `main` and record the starting SHA.
2. Check open PRs once for duplicate work. If the same task already has a PR, continue that PR instead of creating another.
3. Inspect the actual evidence: reported behavior, current code path, relevant tests, deployment/runtime logs when available, and persisted state/ownership boundaries when relevant.
4. Identify the exact failure boundary and state a falsifiable root cause before editing.
5. If the evidence does not establish a root cause, do not guess. Stop and report the exact evidence or access that is missing.

## Fix discipline

1. Reuse the working system around the failure. Do not rebuild completed systems.
2. Do not create duplicate routes, services, tables, state machines, auth paths, approval paths, render paths, or deployment paths to avoid understanding the existing one.
3. Make the smallest change that fixes the proven root cause.
4. Keep one task in one PR. If verification exposes a defect in the same fix, update that PR; do not open another PR for the same problem.
5. Do not bundle cleanup, redesign, dependency upgrades, or unrelated improvements into the fix.
6. Preserve authentication, ownership, idempotency, approved-run identity, and customer data boundaries.

## Two-attempt hard limit

An attempt means a code-changing implementation followed by verification.

- **Attempt 1:** implement the smallest fix for the proven root cause and verify it.
- If Attempt 1 fails, read the exact verification failure. Make **one correction only** if that failure clearly identifies what is wrong with the same fix.
- **Attempt 2:** verify the corrected fix.
- If Attempt 2 fails, **STOP**. Do not try a third approach, rewrite the subsystem, create another PR, keep polling, or ask the customer to repeat the flow.
- Report the exact remaining blocker and the safest next action.

A failed deployment/status read is not permission to poll repeatedly. Perform one fresh read-only status check unless the user explicitly asks for more.

## Verification

Run the checks relevant to the changed surface. For runtime code, this normally includes the applicable tests, typechecks, and production builds. Do not claim a check passed unless it actually ran and passed.

A task is not fixed because the code compiles or a page loads. It is fixed only when the original failure is covered by evidence or a regression test and the relevant build/test boundary passes.

If an unrelated check fails, identify it as unrelated with evidence and stop rather than modifying unrelated code.

## Production and credit safety

- Never merge without explicit user approval.
- Never deploy or redeploy without explicit user approval.
- Never rebuild campaigns during engineering verification.
- Never start mockup/image/video renders during engineering verification.
- Never invoke paid AI/provider generation to test a fix.
- Never spend campaign/customer credits during engineering verification.
- Prefer deterministic tests, mocks, fixtures, existing completed records, and read-only logs/state.
- If a live customer test is truly unavoidable, tell the user exactly **one button to click once**, then inspect the resulting evidence. Do not ask for repeated clicks.

## Required final report

Keep the report short and use exactly these five items:

1. **Failure** — what was actually broken.
2. **Root cause** — the exact code/state/deployment cause.
3. **Fix** — the one focused change made.
4. **Verification** — what passed or the exact blocker if it did not.
5. **Next action** — the single safest next action.

Never say `fixed`, `ready`, or `safe to test` without verification evidence.
