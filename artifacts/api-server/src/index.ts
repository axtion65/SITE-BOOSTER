import app from "./app";
import { logger } from "./lib/logger";
import { startRenderTimeoutWatcher } from "./lib/renderTimeout";

const rawPort = process.env["PORT"];
if (!rawPort) throw new Error("PORT environment variable is required");
const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) throw new Error(`Invalid PORT: "${rawPort}"`);

if (!process.env.STRIPE_API_KEY) {
  logger.warn("STRIPE_API_KEY not set — billing endpoints will fail");
}

const server = app.listen(port, (err) => {
  if (err) { logger.error({ err }, "Error listening on port"); process.exit(1); }
  logger.info({ port }, "Server listening");
  // Auto-fail renders stuck past 3× their expected render time and refund credits
  startRenderTimeoutWatcher();
});

// Graceful shutdown — release the port cleanly before the process exits.
// Without this, Replit restarts cause EADDRINUSE and the server fails to come back up.
function shutdown(signal: string) {
  logger.info({ signal }, "Shutting down gracefully");
  server.close(() => {
    logger.info("Server closed — exiting");
    process.exit(0);
  });
  // Force-exit after 5s if connections don't drain
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));
