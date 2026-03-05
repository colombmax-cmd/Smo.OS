import { compareEvents } from "../core/compare";
import { AnyEvent, CoreEvent, CoreEventType } from "../core/types";

export type { AnyEvent, CoreEvent, CoreEventType };

export type EventMeta = {
  origin: string;
  seq: number;
  seen: Record<string, number>;
};

export function normalizeEventMeta(event: AnyEvent): EventMeta {
  return {
    origin: typeof event.origin === "string" && event.origin.trim() ? event.origin : "legacy",
    seq: typeof event.seq === "number" && Number.isFinite(event.seq) ? event.seq : 0,
    seen: event.seen && typeof event.seen === "object" ? event.seen : {},
  };
}

export function sortEventsDeterministically(events: AnyEvent[]): AnyEvent[] {
  return [...events].sort(compareEvents);
}

export function mergeEventsById(eventsA: AnyEvent[], eventsB: AnyEvent[]): AnyEvent[] {
  const byId: Record<string, AnyEvent> = {};
  for (const event of eventsA) byId[event.id] = event;
  for (const event of eventsB) byId[event.id] = event;
  return sortEventsDeterministically(Object.values(byId));
}
