import express from "express";
import dotenv from "dotenv";
import { loadConfig } from "./utils/config";
import { Scheduler } from "./queue/Scheduler";

dotenv.config();

async function bootstrap() {
  const config = loadConfig();
  const app = express();

  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  const scheduler = new Scheduler(config);
  scheduler.attachRoutes(app);
  scheduler.start();

  app.get("/", (_req, res) => {
    res.json({ name: "voice-slot-scheduler", version: "0.1.0" });
  });

  app.listen(config.port, () => {
    // eslint-disable-next-line no-console
    console.log(`Voice Slot Scheduler listening on port ${config.port}`);
  });
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Fatal error during bootstrap:", err);
  process.exit(1);
});


