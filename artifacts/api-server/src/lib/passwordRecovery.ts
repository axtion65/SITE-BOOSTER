import { createHash, randomBytes } from "node:crypto";

export const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000;

export function hashPasswordResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function createPasswordResetToken(now = Date.now()) {
  const token = randomBytes(32).toString("base64url");
  return {
    token,
    tokenHash: hashPasswordResetToken(token),
    expiresAt: new Date(now + PASSWORD_RESET_TTL_MS),
  };
}

export function passwordResetUrl(
  token: string,
  appUrl = process.env.APP_URL,
): string {
  const baseUrl =
    appUrl ||
    (process.env.NODE_ENV === "production"
      ? "https://quae.ai"
      : "http://localhost:3000");
  const url = new URL("/signin", baseUrl);
  url.searchParams.set("resetToken", token);
  return url.toString();
}
