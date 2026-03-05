import {
  Envelope,
  TRANSPORT_PROTOCOL,
  errorEnvelope,
  isValidEnvelopeShape,
  okEnvelope,
} from "../transport/protocol";

export {
  Envelope,
  TRANSPORT_PROTOCOL,
  errorEnvelope,
  isValidEnvelopeShape,
  okEnvelope,
};

export type TransportErrorCode =
  | "bad_request"
  | "unsupported_type"
  | "unsupported_capability"
  | "cursor_invalid"
  | "limit_exceeded"
  | "internal_error";

export function createEnvelope(type: string, payload: Record<string, unknown>, requestId: string): Envelope {
  return {
    protocol: TRANSPORT_PROTOCOL,
    type,
    requestId,
    sentAt: Date.now(),
    payload,
  };
}
