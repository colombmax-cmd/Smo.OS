import { Event } from "./types";

/**
 * Rebuild simple projection: entities map
 * Entities are simple objects merged from EntityCreated and StateUpdated events.
 */
export function rebuildState(events: Event[]) {
  const entities: Record<string, any> = {};

  for (const event of events) {
    const id = event.entityId;
    if (!entities[id]) {
      entities[id] = { id };
    }

    if (event.type === "EntityCreated") {
      // payload expected to contain initial fields, e.g. { name, status }
      entities[id] = { ...entities[id], ...event.payload };
    } else if (event.type === "StateUpdated") {
      // payload: partial update
      entities[id] = { ...entities[id], ...event.payload };
    } else if (event.type === "RelationAdded") {
      // relation stored in an array
      entities[id].relations = entities[id].relations || [];
      entities[id].relations.push(event.payload);
    } else if (event.type === "MetricRecorded") {
      entities[id].metrics = entities[id].metrics || [];
      entities[id].metrics.push(event.payload);
    }
    // other event types are intentionally simple / extensible
  }

  return entities;
}