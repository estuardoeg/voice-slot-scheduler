export type AppConfig = {
  port: number;
  pollingIntervalMs: number;
  concurrencyLimit: number;
  elevenLabsApiKey: string;
  elevenLabsActiveCallsUrl: string;
  elevenLabsStartCallUrl: string;
  webhookSecret?: string;
  elevenLabsActiveStatuses: string[]; // e.g. ["running"] for batch calling
  elevenLabsActiveCountStrategy: "batches" | "dispatched"; // how to compute active count from batch list
};

function readNumber(envVar: string | undefined, fallback: number): number {
  if (!envVar) return fallback;
  const parsed = Number(envVar);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function loadConfig(): AppConfig {
  const port = readNumber(process.env.PORT, 4000);
  const pollingIntervalMs = readNumber(process.env.POLLING_INTERVAL_MS, 2000);
  const concurrencyLimit = readNumber(process.env.ELEVENLABS_CONCURRENCY_LIMIT, 5);

  const elevenLabsApiKey = process.env.ELEVENLABS_API_KEY || "";
  const elevenLabsActiveCallsUrl =
    process.env.ELEVENLABS_ACTIVE_CALLS_URL || "";
  const elevenLabsStartCallUrl = process.env.ELEVENLABS_START_CALL_URL || "";
  const webhookSecret = process.env.WEBHOOK_SECRET;

  const elevenLabsActiveStatuses = (process.env.ELEVENLABS_ACTIVE_STATUSES || "in_progress")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const elevenLabsActiveCountStrategy =
    (process.env.ELEVENLABS_ACTIVE_COUNT_STRATEGY as "batches" | "dispatched") ||
    "dispatched";

  if (!elevenLabsApiKey) {
    // eslint-disable-next-line no-console
    console.warn(
      "ELEVENLABS_API_KEY is not set. Outbound requests will fail until configured."
    );
  }

  if (!elevenLabsActiveCallsUrl) {
    // eslint-disable-next-line no-console
    console.warn(
      "ELEVENLABS_ACTIVE_CALLS_URL is not set. Active call polling is disabled."
    );
  }

  if (!elevenLabsStartCallUrl) {
    // eslint-disable-next-line no-console
    console.warn(
      "ELEVENLABS_START_CALL_URL is not set. Calls cannot be started until configured."
    );
  }

  return {
    port,
    pollingIntervalMs,
    concurrencyLimit,
    elevenLabsApiKey,
    elevenLabsActiveCallsUrl,
    elevenLabsStartCallUrl,
    webhookSecret,
    elevenLabsActiveStatuses,
    elevenLabsActiveCountStrategy,
  };
}


