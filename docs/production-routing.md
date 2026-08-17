# Quae production routing

## Investigation result

Mockup Studio calls `marketingApi("/mockups/:id/generate")`; the wrapper turns that into the
same-origin request `POST /api/mockups/:id/generate`. It does not contain a separate production API
base URL. Repository history shows that older Vercel deployments rewrote that request to
`site-booster.replit.app`, while the current root configuration targets Railway. The observed lack
of any POST or generation diagnostic in the healthy Railway deployment therefore occurs before the
API server: repeated Vercel build-rate failures left `quae.ai` assigned to an older frontend
deployment. The repair is both the Railway-first rewrite and a build gate that rejects a wrong
destination, duplicate Vercel configuration, duplicate `/api` prefix, or incorrect frontend
artifact before a deployment can succeed.

The production frontend is deployed from the repository root to the existing Vercel project
`site-booster-api-server-y7ui`. Its production domain is `quae.ai`. The Vercel project must not
use a monorepo Root Directory override: the root `vercel.json` builds and publishes
`artifacts/quae/dist/public`.

Vercel proxies the first matching rewrite, `/api/:path*`, to
`https://site-booster-production.up.railway.app/api/:path*`. This same-origin proxy preserves the
incoming HTTP method, request body, and headers (including `Authorization`). The catch-all rewrite
to `index.html` follows it and is only for non-API browser routes. There are no Vercel serverless
API stubs in this deployment.

## Deployment gate

1. Deploy this commit from `main` to Vercel project `site-booster-api-server-y7ui` and wait for its
   build, including `scripts/verify-production-routing.mjs`, to pass.
2. If Railway redeploys, require the `SITE-BOOSTER` deployment to pass before promoting Vercel.
3. Assign `quae.ai` only to that successful Vercel deployment.
4. Request `https://quae.ai/api/health` without authentication. It must return Railway JSON with
   a JSON content type, never the frontend HTML document.
5. Stop before any paid generation. A human may then perform one controlled smoke test by opening
   an existing project and clicking **Create visual** once while watching Railway request logs.
