import { describe, it, expect, beforeEach, vi } from "vitest";
import { ElevenLabsClient } from "./ElevenLabsClient";
import type { AppConfig } from "../utils/config";

const baseConfig: AppConfig = {
  port: 0,
  pollingIntervalMs: 1000,
  concurrencyLimit: 5,
  elevenLabsApiKey: "test-key",
  elevenLabsActiveCallsUrl: "https://example.com/active",
  elevenLabsStartCallUrl: "https://example.com/start",
  webhookSecret: undefined,
  elevenLabsActiveStatuses: ["in_progress"],
  elevenLabsActiveCountStrategy: "dispatched",
};

declare const global: any;

beforeEach(() => {
  vi.restoreAllMocks();
  process.env.ELEVENLABS_API_KEY = baseConfig.elevenLabsApiKey;
});

describe("ElevenLabsClient.getActiveCallsCount (batch calling)", () => {
  it("sums total_calls_dispatched for in_progress when strategy=dispatched", async () => {
    const client = new ElevenLabsClient({ ...baseConfig, elevenLabsActiveCountStrategy: "dispatched" });
    const mockJson = {
      batch_calls: [
        { status: "in_progress", total_calls_dispatched: 3 },
        { status: "completed", total_calls_dispatched: 5 },
      ],
    };
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => mockJson });

    const count = await client.getActiveCallsCount();
    expect(count).toBe(3);
    expect(global.fetch).toHaveBeenCalledWith(baseConfig.elevenLabsActiveCallsUrl, expect.any(Object));
  });

  it("counts batches with in_progress when strategy=batches", async () => {
    const client = new ElevenLabsClient({ ...baseConfig, elevenLabsActiveCountStrategy: "batches" });
    const mockJson = {
      batch_calls: [
        { status: "in_progress", total_calls_dispatched: 3 },
        { status: "completed", total_calls_dispatched: 5 },
      ],
    };
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => mockJson });

    const count = await client.getActiveCallsCount();
    expect(count).toBe(1);
  });
});

describe("ElevenLabsClient.startCall (twilio outbound)", () => {
  it("maps camelCase fields to snake_case, sets xi-api-key, and returns IDs", async () => {
    const client = new ElevenLabsClient(baseConfig);
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ conversation_id: "conv-1", callSid: "sid-1" }) });
    global.fetch = fetchSpy;

    const result = await client.startCall({
      agentId: "agent-123",
      agentPhoneNumberId: "phone-456",
      toNumber: "+15551234567",
      conversationInitiationClientData: { orderId: "789" },
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe(baseConfig.elevenLabsStartCallUrl);
    expect(init.method).toBe("POST");
    expect(init.headers["xi-api-key"]).toBe(baseConfig.elevenLabsApiKey);
    const sentBody = JSON.parse(init.body);
    expect(sentBody).toMatchObject({
      agent_id: "agent-123",
      agent_phone_number_id: "phone-456",
      to_number: "+15551234567",
      conversation_initiation_client_data: { orderId: "789" },
    });

    expect(result.callId).toBe("conv-1");
    expect(result.conversationId).toBe("conv-1");
    expect(result.callSid).toBe("sid-1");
  });
});


