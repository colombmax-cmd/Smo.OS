/**
 * Rebuild simple projection: entities map
 * Entities are simple objects merged from EntityCreated and StateUpdated events.
 */
import { Event } from "./types";
import { compareEvents } from "./compare";

type Conflict = {
  entityId: string;
  field: string;
  candidates: Array<{
    value: any;
    eventId: string;
    origin: string;
    seq: number;
    timestamp: number;
  }>;
  winner: {
    value: any;
    eventId: string;
    origin: string;
    seq: number;
    timestamp: number;
  };
};

export function rebuildState(events: Event[]) {
  const sorted = [...events].sort(compareEvents);

  const entities: Record<string, any> = {};
  const conflicts: Conflict[] = [];

  // Track last write per (entityId, field)
  const lastWrite: Record<string, { value: any; event: Event }> = {};

  for (const event of sorted) {
    const id = event.entityId;
    if (!entities[id]) entities[id] = { id };

    if (event.type === "EntityCreated") {
      entities[id] = { ...entities[id], ...event.payload };
      // Track each field as lastWrite
      for (const [k, v] of Object.entries(event.payload)) {
        lastWrite[`${id}:${k}`] = { value: v, event };
      }
      continue;
    }

    if (event.type === "StateUpdated") {
      for (const [k, v] of Object.entries(event.payload)) {
        const key = `${id}:${k}`;
        const prev = lastWrite[key];

        if (prev) {
          const prevEvent = prev.event;

          const differentOrigin = prevEvent.origin !== event.origin;
          const differentValue = prev.value !== v;

          if (differentOrigin && differentValue) {
            // Conflict becomes visible because a different origin overwrote a different value
            const winner = compareEvents(prevEvent, event) <= 0 ? event : prevEvent;
            const loser = winner.id === event.id ? prevEvent : event;

            conflicts.push({
              entityId: id,
              field: k,
              candidates: [
                {
                  value: prev.value,
                  eventId: prevEvent.id,
                  origin: prevEvent.origin,
                  seq: prevEvent.seq,
                  timestamp: prevEvent.timestamp,
                },
                {
                  value: v,
                  eventId: event.id,
                  origin: event.origin,
                  seq: event.seq,
                  timestamp: event.timestamp,
                },
              ],
              winner: {
                value: winner === event ? v : prev.value,
                eventId: winner.id,
                origin: winner.origin,
                seq: winner.seq,
                timestamp: winner.timestamp,
              },
            });
          }
        }

        // Apply value (LWW according to ordering)
        // Since we're iterating in sorted order, the latest wins naturally
        entities[id][k] = v;
        lastWrite[key] = { value: v, event };
      }
      continue;
    }

    if (event.type === "RelationAdded") {
      entities[id].relations = entities[id].relations || [];
      entities[id].relations.push(event.payload);
      continue;
    }

    if (event.type === "MetricRecorded") {
      entities[id].metrics = entities[id].metrics || [];
      entities[id].metrics.push(event.payload);
      continue;
    }
  }

  return { entities, conflicts };
}