import { AppConfig } from "../utils/config";
import { CallTaskPayload, StartCallResult } from "../types";

export class ElevenLabsClient {
  private readonly activeCallsUrl: string;
  private readonly startCallUrl: string;
  private readonly activeStatuses: Set<string>;
  private readonly countStrategy: "batches" | "dispatched";

  constructor(config: AppConfig) {
    this.activeCallsUrl = config.elevenLabsActiveCallsUrl;
    this.startCallUrl = config.elevenLabsStartCallUrl;
    this.activeStatuses = new Set(config.elevenLabsActiveStatuses);
    this.countStrategy = config.elevenLabsActiveCountStrategy;
  }

  async getActiveCallsCount(): Promise<number> {
    if (!this.activeCallsUrl) return 0;
    const resp = await fetch(this.activeCallsUrl, {
      method: "GET",
      headers: {
        "xi-api-key": process.env.ELEVENLABS_API_KEY || "",
        "Content-Type": "application/json",
      },
    });
    if (!resp.ok) {
      throw new Error(`Active calls request failed: ${resp.status}`);
    }
    const data = await resp.json();

    // Flexible response parsing:
    // 1) ElevenLabs batch calling list: { batch_calls: [...] }
    // 2) number
    // 3) { activeCount: number }
    // 4) array of calls with status/state === 'active'
    if (typeof data === "number") return data;

    if (data && typeof data === "object") {
      const anyData: any = data;
      // Case 1: batch calling list
      if (Array.isArray(anyData.batch_calls)) {
        // Strategy can be 'dispatched' (sum dispatched for running statuses) or 'batches' (count running batches)
        const activeStatuses = this.activeStatuses;
        if (this.countStrategy === "dispatched") {
          return anyData.batch_calls.reduce((sum: number, b: any) => {
            const status = String(b?.status || "").toLowerCase();
            if (!activeStatuses.has(status)) return sum;
            const dispatched = Number(b?.total_calls_dispatched || 0);
            return sum + (Number.isFinite(dispatched) ? dispatched : 0);
          }, 0);
        }
        // batches
        return anyData.batch_calls.reduce((sum: number, b: any) => {
          const status = String(b?.status || "").toLowerCase();
          return sum + (activeStatuses.has(status) ? 1 : 0);
        }, 0);
      }

      // Case 3: object with activeCount
      if (typeof anyData.activeCount === "number") return anyData.activeCount as number;

      // Case 4: array under items
      if (Array.isArray(anyData.items)) {
        return (anyData.items as any[]).filter(
          (c) => (c?.status || c?.state) === "active"
        ).length;
      }
    }

    // Case 4 alt: top-level array
    if (Array.isArray(data)) {
      return data.filter((c: any) => (c?.status || c?.state) === "active").length;
    }

    return 0;
  }

  async startCall(payload: CallTaskPayload): Promise<StartCallResult> {
    if (!this.startCallUrl) {
      throw new Error("ELEVENLABS_START_CALL_URL is not configured");
    }
    // Map camelCase -> snake_case expected by Twilio outbound-call
    const body: Record<string, unknown> = {
      agent_id: (payload as any).agent_id ?? payload.agentId,
      agent_phone_number_id:
        (payload as any).agent_phone_number_id ?? payload.agentPhoneNumberId,
      to_number: (payload as any).to_number ?? payload.toNumber,
      conversation_initiation_client_data:
        (payload as any).conversation_initiation_client_data ??
        payload.conversationInitiationClientData,
    };

    if (!body.agent_id || !body.agent_phone_number_id || !body.to_number) {
      throw new Error(
        "Missing required Twilio outbound-call fields: agent_id, agent_phone_number_id, to_number"
      );
    }

    const resp = await fetch(this.startCallUrl, {
      method: "POST",
      headers: {
        "xi-api-key": process.env.ELEVENLABS_API_KEY || "",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      throw new Error(`Start call request failed: ${resp.status}`);
    }
    const data = await resp.json();
    const conversationId = (data as any)?.conversation_id || (data as any)?.conversationId;
    const callSid = (data as any)?.callSid;
    const callId = conversationId || callSid || (data as any)?.id || (data as any)?.call_id || (data as any)?.callId;
    if (!callId) {
      throw new Error("Could not determine callId from ElevenLabs response");
    }
    return { callId: String(callId), conversationId, callSid };
  }
}


