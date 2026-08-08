# Quae.ai

AI-powered video generator SaaS for entrepreneurs — turn a product description into a polished video ad in minutes.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080, served at `/api`)
- `pnpm --filter @workspace/quae run dev` — run the frontend (served at `/`)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL`, `AI_INTEGRATIONS_ANTHROPIC_BASE_URL`, `AI_INTEGRATIONS_ANTHROPIC_API_KEY`

## One-time administrator bootstrap (Railway)

To promote an existing account, add `QUAE_ADMIN_BOOTSTRAP_EMAIL` to the API
service under **Railway project → API service → Variables**, set to the exact
lowercase account email, and deploy/restart the service. Before accepting
traffic, startup looks up that unique existing email and changes only its
`is_admin` value to `true`. It never creates an account and fails startup if the
email does not exist. Repeated starts are idempotent. After the successful log
message identifies the user ID and email, remove the variable and redeploy;
admin status remains stored in PostgreSQL.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite, Tailwind CSS, Wouter, Framer Motion, TanStack Query
- API: Express 5
- DB: PostgreSQL + Drizzle ORM (`users`, `projects` tables)
- Validation: Zod (`zod/v4`), `drizzle-zod`
- AI: Anthropic Claude Sonnet (via Replit AI Integrations proxy) for prompt expansion
- API codegen: Orval (from OpenAPI spec)

## Where things live

- `lib/api-spec/openapi.yaml` — source of truth for all API contracts
- `lib/db/src/schema/` — `users.ts`, `projects.ts` (Drizzle schema)
- `artifacts/api-server/src/routes/` — `auth.ts`, `studio.ts`, `templates.ts`, `projects.ts`, `admin.ts`
- `artifacts/quae/src/pages/` — `home.tsx`, `signin.tsx`, `studio/`, `templates.tsx`, `admin.tsx`
- `artifacts/quae/src/hooks/use-auth.tsx` — auth context (localStorage token, `useGetMe`)

## Architecture decisions

- Auth is simple token-based (base64 userId:timestamp) stored in localStorage — no sessions table needed for v1
- Passwords hashed with SHA-256 + salt — upgrade to bcrypt for production
- Prompt expansion routes through Claude Sonnet to convert basic product descriptions into structured cinematic video scripts with scenes, hook, CTA, voiceover, and music suggestion
- Rendering model list is static data (no DB) — 5 models across free/creator/agency tiers
- Templates are static data (12 templates) — add DB-backed templates when user-uploaded templates are needed
- All API hooks imported from `@workspace/api-client-react` barrel (not deep paths)

## Product

- **Landing page** (`/`): Hero, stats bar, features grid, 4-step how-it-works, templates preview, uniform 3-tier pricing (Free/Creator/Agency), social proof
- **Auth** (`/signin`): Sign in / Create Account tabs, Forgot Password flow
- **AI Video Studio** (`/studio`): 4-step wizard (Describe → AI Expands Script → Customize → Export), model selection sidebar toggle powered by Claude 3.5 Sonnet
- **Projects** (`/studio/projects`, `/studio/projects/:id`): List, detail, delete, status management
- **Templates** (`/templates`): Browse 12 templates with category filters
- **Admin** (`/admin`): Platform stats, full user management table (plan/credits/admin toggle/delete)

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Always use `@workspace/api-client-react` barrel import (not deep paths like `/src/generated/api`) — Vite doesn't resolve deep package paths without export map entries
- After any OpenAPI spec change, run `pnpm --filter @workspace/api-spec run codegen` before writing routes or frontend code
- Token auth: decode with `Buffer.from(token, 'base64url').toString('utf-8').split(':')[0]` to get userId
- Anthropic env vars are auto-set by Replit AI Integrations — never set them manually

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
