export const TRANSPORT_PROTOCOL = "plos.transport/0.1";

export type Envelope = {
  protocol: string;
  type: string;
  requestId: string;
  sentAt: number;
  payload: any;
};

export function okEnvelope(requestId: string, type: string, payload: any): Envelope {
  return {
    protocol: TRANSPORT_PROTOCOL,
    type,
    requestId,
    sentAt: Date.now(),
    payload,
  };
}

export function errorEnvelope(
  requestId: string,
  code:
    | "bad_request"
    | "unsupported_type"
    | "unsupported_capability"
    | "cursor_invalid"
    | "limit_exceeded"
    | "internal_error",
  message: string,
  retryable?: boolean
): Envelope {
  return {
    protocol: TRANSPORT_PROTOCOL,
    type: "plos.transport/error",
    requestId,
    sentAt: Date.now(),
    payload: { code, message, ...(typeof retryable === "boolean" ? { retryable } : {}) },
  };
}

export function isValidEnvelopeShape(obj: any): obj is Envelope {
  return (
    obj &&
    typeof obj === "object" &&
    typeof obj.protocol === "string" &&
    typeof obj.type === "string" &&
    typeof obj.requestId === "string" &&
    typeof obj.sentAt === "number" &&
    typeof obj.payload === "object" &&
    obj.payload !== null
  );
}
