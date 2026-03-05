import { z } from "zod";
import { AnyEvent } from "./events";
import { Envelope, TRANSPORT_PROTOCOL } from "./transport";

const seenSchema = z.record(z.string(), z.number().int().nonnegative());

export const anyEventSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  entityId: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
  timestamp: z.number(),
  origin: z.string().min(1).optional(),
  seq: z.number().int().nonnegative().optional(),
  seen: seenSchema.optional(),
});

export const envelopeSchema = z.object({
  protocol: z.literal(TRANSPORT_PROTOCOL),
  type: z.string().min(1),
  requestId: z.string().min(1),
  sentAt: z.number(),
  payload: z.record(z.string(), z.unknown()),
});

export function parseEvent(input: unknown): AnyEvent {
  return anyEventSchema.parse(input) as AnyEvent;
}

export function parseEnvelope(input: unknown): Envelope {
  return envelopeSchema.parse(input) as Envelope;
}

export function isEvent(input: unknown): input is AnyEvent {
  return anyEventSchema.safeParse(input).success;
}

export function isEnvelope(input: unknown): input is Envelope {
  return envelopeSchema.safeParse(input).success;
}
