import express, { Request, Response } from "express";
import { AppConfig } from "../utils/config";
import { CallTaskPayload, EnqueueRequest, WebhookEvent } from "../types";
import { ElevenLabsClient } from "../elevenlabs/ElevenLabsClient";

type QueueItem = {
  id: string;
  enqueuedAt: number;
  payload: CallTaskPayload;
  priority: number;
};

class InMemoryPriorityQueue {
  private readonly items: QueueItem[] = [];

  enqueue(item: QueueItem) {
    this.items.push(item);
    // Higher priority first; FIFO among same priority
    this.items.sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return a.enqueuedAt - b.enqueuedAt;
    });
  }

  dequeue(): QueueItem | undefined {
    return this.items.shift();
  }

  size(): number {
    return this.items.length;
  }

  snapshot(): QueueItem[] {
    return [...this.items];
  }
}

export class Scheduler {
  private readonly config: AppConfig;
  private readonly client: ElevenLabsClient;
  private readonly queue: InMemoryPriorityQueue;
  private readonly inFlight: Set<string> = new Set();
  private timer: NodeJS.Timeout | null = null;
  private latestRemoteActive = 0;

  constructor(config: AppConfig) {
    this.config = config;
    this.client = new ElevenLabsClient(config);
    this.queue = new InMemoryPriorityQueue();
  }

  attachRoutes(app: express.Express) {
    app.post("/enqueue-call", async (req: Request, res: Response) => {
      const body = req.body as EnqueueRequest;
      if (!body || typeof body !== "object" || !body.payload) {
        return res.status(400).json({ error: "Invalid payload" });
      }
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      this.queue.enqueue({
        id,
        enqueuedAt: Date.now(),
        payload: body.payload,
        priority: Number(body.priority ?? 0),
      });
      this.tick().catch(() => void 0);
      return res.status(202).json({ enqueued: true, id, queueSize: this.queue.size() });
    });

    app.get("/stats", (_req: Request, res: Response) => {
      const availableSlots = Math.max(
        0,
        this.config.concurrencyLimit - this.latestRemoteActive - this.inFlight.size
      );
      res.json({
        queueSize: this.queue.size(),
        inFlight: this.inFlight.size,
        remoteActive: this.latestRemoteActive,
        concurrencyLimit: this.config.concurrencyLimit,
        availableSlots,
      });
    });

    app.post("/webhook/elevenlabs", async (req: Request, res: Response) => {
      const event = req.body as WebhookEvent;
      // Optional: HMAC signature validation via WEBHOOK_SECRET if provided
      const status = String(event?.status || event?.type || "").toLowerCase();
      const rawId =
        (event as any)?.callId ||
        (event as any)?.conversation_id ||
        (event as any)?.conversationId ||
        (event as any)?.callSid ||
        (event as any)?.id;
      const callId = rawId ? String(rawId) : "";
      if (!callId) return res.status(400).json({ error: "Missing call identifier" });

      // Estados terminales según Batch Calling: completed, failed, cancelled
      if (["completed", "failed", "cancelled"].includes(status)) {
        if (this.inFlight.has(callId)) this.inFlight.delete(callId);
      }
      // Trigger a tick to drain queue if slots are available now
      this.tick().catch(() => void 0);
      return res.status(200).json({ ok: true });
    });
  }

  start() {
    if (this.timer) return; // already started
    this.timer = setInterval(() => {
      this.tick().catch(() => void 0);
    }, Math.max(500, this.config.pollingIntervalMs));
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async tick() {
    // Refresh remote active count
    try {
      this.latestRemoteActive = await this.client.getActiveCallsCount();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("Failed to poll ElevenLabs active calls:", (err as Error).message);
    }

    let availableSlots = this.config.concurrencyLimit - this.latestRemoteActive - this.inFlight.size;
    while (availableSlots > 0 && this.queue.size() > 0) {
      const item = this.queue.dequeue();
      if (!item) break;
      availableSlots -= 1;
      void this.dispatch(item);
    }
  }

  private async dispatch(item: QueueItem) {
    try {
      const result = await this.client.startCall(item.payload);
      this.inFlight.add(result.callId);
    } catch (err) {
      // On failure, requeue with slight priority decay to avoid hot-loop
      // eslint-disable-next-line no-console
      console.error("Failed to start call:", (err as Error).message);
      this.queue.enqueue({
        id: `${item.id}-retry`,
        enqueuedAt: Date.now(),
        payload: item.payload,
        priority: Math.max(-1000, item.priority - 1),
      });
    }
  }
}


