import { readEvents } from "../core/log";
import { sealAllCurrentEventsIntoNewSegment } from "./segment_seal";

const MAX_EVENTS_PER_SEGMENT = 1000;

/**
 * Si le buffer events.jsonl contient trop d'events,
 * on scelle en un segment signé + on vide le buffer.
 */
export function maybeSeal(): boolean {
  const events = readEvents();
  if (events.length >= MAX_EVENTS_PER_SEGMENT) {
    console.log(`[seal] Buffer has ${events.length} events (>= ${MAX_EVENTS_PER_SEGMENT}). Sealing...`);
    sealAllCurrentEventsIntoNewSegment();
    return true;
  }
  return false;
}