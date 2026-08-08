import { pool } from "@workspace/db";
import { logger } from "./logger";

export const ADMIN_BOOTSTRAP_EMAIL_ENV = "QUAE_ADMIN_BOOTSTRAP_EMAIL";

/**
 * Promotes the single, existing account selected by the deployment environment.
 *
 * The email column is unique, and this never creates a user, so setting the
 * variable cannot grant access to a future signup or more than one account.
 * Re-running it is harmless because an existing administrator is left as-is.
 */
export async function bootstrapAdminFromEnvironment(): Promise<void> {
  const configuredEmail = process.env[ADMIN_BOOTSTRAP_EMAIL_ENV];
  if (!configuredEmail) {
    logger.info({ env: ADMIN_BOOTSTRAP_EMAIL_ENV }, "Admin bootstrap not configured");
    return;
  }

  const email = configuredEmail.trim().toLowerCase();
  if (!email || email !== configuredEmail.trim()) {
    throw new Error(`${ADMIN_BOOTSTRAP_EMAIL_ENV} must be a lowercase email address`);
  }

  const result = await pool.query<{ id: string; email: string; is_admin: boolean }>(
    `UPDATE users
       SET is_admin = TRUE, updated_at = NOW()
     WHERE email = $1 AND is_admin = FALSE
     RETURNING id, email, is_admin`,
    [email],
  );

  if (result.rowCount === 1) {
    const user = result.rows[0];
    logger.info({ userId: user.id, email: user.email }, "Admin bootstrap promoted account");
    return;
  }

  const existing = await pool.query<{ id: string; email: string; is_admin: boolean }>(
    `SELECT id, email, is_admin FROM users WHERE email = $1`,
    [email],
  );
  if (existing.rowCount !== 1) {
    throw new Error(`${ADMIN_BOOTSTRAP_EMAIL_ENV} does not match an existing account`);
  }

  const user = existing.rows[0];
  logger.info({ userId: user.id, email: user.email }, "Admin bootstrap account is already an administrator");
}
