import { Event } from "./types";

export function compareEvents(a: Event, b: Event) {
  // 1) timestamp
  if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;

  // 2) origin (stable tie-break)
  if (a.origin !== b.origin) return a.origin.localeCompare(b.origin);

  // 3) seq (stable within origin)
  if (a.seq !== b.seq) return a.seq - b.seq;

  // 4) id final
  return a.id.localeCompare(b.id);
}