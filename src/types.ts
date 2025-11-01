export type CallTaskPayload = Record<string, unknown> & {
  // Generic optional fields
  text?: string;
  voiceId?: string;
  metadata?: Record<string, unknown>;

  // Twilio outbound call (Agents Platform)
  agentId?: string; // maps to agent_id
  agentPhoneNumberId?: string; // maps to agent_phone_number_id
  toNumber?: string; // maps to to_number
  conversationInitiationClientData?: Record<string, unknown>; // maps to conversation_initiation_client_data
};

export type EnqueueRequest = {
  payload: CallTaskPayload;
  priority?: number;
};

export type StartCallResult = {
  callId: string; // tracked identifier (conversation_id preferred)
  conversationId?: string;
  callSid?: string;
};

export type WebhookEvent = {
  type: string;
  callId?: string;
  status?: string;
  signature?: string;
  [key: string]: unknown;
};


