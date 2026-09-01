---
name: bdb-execution
description: Execute SITE-BOOSTER engineering tasks with a strict root-cause-first, one-fix, two-attempt maximum workflow. Use for production bugs, failed customer flows, deployment/runtime failures, broken tests, or any request to fix Quae.ai without repeated guessing. Never use paid generation or customer credits for verification.
---

# BDB execution

Follow the repository `AGENTS.md` exactly.

## Workflow

1. Record latest `main` SHA and check open PRs once.
2. Gather read-only evidence until the exact failure boundary is identified.
3. State the root cause before editing. If it cannot be proven, stop and report missing evidence.
4. Reuse the existing working architecture and make the smallest possible change.
5. Add or update the narrow regression test when the defect is testable.
6. Verify the changed surface with relevant tests, typechecks, and builds.
7. If verification fails because the same fix is wrong, inspect the exact failure and allow one correction only.
8. After the second failed code-changing attempt, stop. No third attempt, no replacement PR, no subsystem rewrite, no repeated live test.
9. Never merge or deploy without explicit user approval.
10. Never submit provider work, rebuild campaigns, render assets/videos, or consume campaign credits during engineering verification.

## Output contract

Report only:

1. Failure
2. Root cause
3. Fix
4. Verification
5. Next action

Do not call the task fixed without evidence.
