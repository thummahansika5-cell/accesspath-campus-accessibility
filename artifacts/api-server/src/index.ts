import app from "./app";
import { logger } from "./lib/logger";
import { seedCampus } from "./lib/seed-campus";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function start(): Promise<void> {
  await seedCampus();
  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }
    logger.info({ port }, "Server listening");
  });
}

void start().catch((err: unknown) => {
  logger.error({ err }, "Failed to seed campus data or start the API");
  process.exit(1);
});
