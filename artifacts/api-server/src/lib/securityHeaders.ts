export const API_SECURITY_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Security-Policy": "frame-ancestors 'self'",
  "Permissions-Policy": "camera=(), geolocation=(), microphone=()",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Strict-Transport-Security": "max-age=31536000",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN",
  "X-Permitted-Cross-Domain-Policies": "none",
} as const;

export function setApiSecurityHeaders(
  response: { setHeader(name: string, value: string): unknown },
): void {
  for (const [name, value] of Object.entries(API_SECURITY_HEADERS)) {
    response.setHeader(name, value);
  }
}
