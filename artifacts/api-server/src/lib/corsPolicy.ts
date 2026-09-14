type CorsEnvironment = {
  APP_URL?: string;
  CORS_ALLOWED_ORIGINS?: string;
  NODE_ENV?: string;
};

const QUAE_PRODUCTION_ORIGINS = new Set([
  "https://quae.ai",
  "https://www.quae.ai",
]);

function normalizeHttpOrigin(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function allowedBrowserOrigins(
  env: CorsEnvironment = process.env,
): ReadonlySet<string> {
  const origins = new Set(QUAE_PRODUCTION_ORIGINS);
  const appOrigin = normalizeHttpOrigin(env.APP_URL);
  if (appOrigin) origins.add(appOrigin);

  for (const value of env.CORS_ALLOWED_ORIGINS?.split(",") ?? []) {
    const origin = normalizeHttpOrigin(value);
    if (origin) origins.add(origin);
  }
  return origins;
}

export function isAllowedBrowserOrigin(
  origin: string | undefined,
  env: CorsEnvironment = process.env,
): boolean {
  // Non-browser clients, same-service probes, and signed provider webhooks do
  // not send Origin. Authentication and webhook signatures still apply.
  if (!origin) return true;

  const normalized = normalizeHttpOrigin(origin);
  if (!normalized) return false;
  if (allowedBrowserOrigins(env).has(normalized)) return true;

  if (env.NODE_ENV !== "production") {
    const { hostname } = new URL(normalized);
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "[::1]"
    );
  }
  return false;
}
