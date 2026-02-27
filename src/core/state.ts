import { Event } from "./types";
import { compareEvents } from "./compare";

/**
 * Helpers: tolerate legacy events (read tolerant).
 */
function normalizeEvent(e: any): Event {
  return {
    ...e,
    origin: e.origin ?? "legacy",
    seq: e.seq ?? 0,
    seen: e.seen ?? {},
  };
}

/**
 * Causality: "a sees b" if a.seen[b.origin] >= b.seq
 */
function sees(a: any, b: any): boolean {
  const aSeen: Record<string, number> = a.seen ?? {};
  const bOrigin = b.origin ?? "legacy";
  const bSeq = b.seq ?? 0;
  return (aSeen[bOrigin] ?? 0) >= bSeq;
}

/**
 * Concurrency: concurrent if neither sees the other
 */
function concurrent(a: any, b: any): boolean {
  return !sees(a, b) && !sees(b, a);
}

type ConflictCandidate = {
  value: any;
  eventId: string;
  origin: string;
  seq: number;
  timestamp: number;
};

type Conflict = {
  entityId: string;
  field: string;
  candidates: [ConflictCandidate, ConflictCandidate];
  winner: ConflictCandidate;
  resolved: boolean;
  resolvedByEventId?: string;     // ConflictResolved event id
  chosenEventId?: string;         // chosenEventId from payload
};

/**
 * Rebuild projection from events.
 * - entities: reconstructed state
 * - conflicts: detected concurrent writes on same (entityId, field)
 *
 * Supports ConflictResolved:
 * - append-only resolution that forces the winner for a given field
 */
export function rebuildState(events: Event[]) {
  // Sort deterministically and normalize (read tolerant)
  const sorted = [...events].sort(compareEvents).map(normalizeEvent);

  const entities: Record<string, any> = {};
  const conflicts: Conflict[] = [];

  // index events by id (needed for ConflictResolved lookup)
  const eventById: Record<string, Event> = {};

  // Track last write per (entityId, field)
  const lastWrite: Record<string, { value: any; event: Event }> = {};

  // Track resolutions per (entityId, field) -> chosenEventId
  const resolutions: Record<string, { chosenEventId: string; resolvedByEventId: string }> = {};

  // Utility: build candidate from (event, value)
  const candidateOf = (ev: Event, value: any): ConflictCandidate => ({
    value,
    eventId: ev.id,
    origin: ev.origin,
    seq: ev.seq,
    timestamp: ev.timestamp,
  });

  // Utility: apply a value write to state + lastWrite
  const applyWrite = (entityId: string, field: string, value: any, ev: Event) => {
    if (!entities[entityId]) entities[entityId] = { id: entityId };
    entities[entityId][field] = value;
    lastWrite[`${entityId}:${field}`] = { value, event: ev };
  };

  // First pass: process events in order
  for (const ev of sorted) {
    eventById[ev.id] = ev;

    const entityId = ev.entityId;
    if (!entities[entityId]) entities[entityId] = { id: entityId };

    if (ev.type === "ConflictResolved") {
      const field = ev.payload?.field;
      const chosenEventId = ev.payload?.chosenEventId;
      if (typeof field === "string" && typeof chosenEventId === "string") {
        resolutions[`${entityId}:${field}`] = {
          chosenEventId,
          resolvedByEventId: ev.id,
        };
      }
      continue;
    }

    if (ev.type === "EntityCreated") {
      // Apply all payload fields as initial state
      for (const [k, v] of Object.entries(ev.payload ?? {})) {
        applyWrite(entityId, k, v, ev);
      }
      continue;
    }

    if (ev.type === "StateUpdated") {
      for (const [field, value] of Object.entries(ev.payload ?? {})) {
        const key = `${entityId}:${field}`;
        const prev = lastWrite[key];

        if (prev) {
          const prevEv = prev.event;

          const differentOrigin = prevEv.origin !== ev.origin;
          const differentValue = prev.value !== value;

          // Real conflict only if concurrent (offline / no causality)
          if (differentOrigin && differentValue && concurrent(prevEv, ev)) {
            // Default winner in this sorted iteration is the current event (LWW by order)
            let winnerEv: Event = ev;
            let winnerValue: any = value;

            const resolution = resolutions[key];
            let resolved = false;
            let resolvedByEventId: string | undefined = undefined;
            let chosenEventId: string | undefined = undefined;

            // If resolved, force winner according to chosenEventId (append-only)
            if (resolution) {
              resolved = true;
              resolvedByEventId = resolution.resolvedByEventId;
              chosenEventId = resolution.chosenEventId;

              const chosen = eventById[resolution.chosenEventId];
              if (
                chosen &&
                chosen.type === "StateUpdated" &&
                chosen.payload &&
                Object.prototype.hasOwnProperty.call(chosen.payload, field)
              ) {
                winnerEv = chosen;
                winnerValue = (chosen.payload as any)[field];
              }
              // If chosen event isn't found or doesn't contain the field, we keep default.
            } else {
              // Not resolved: keep deterministic winner as the later one in order.
              // Since we iterate sorted, "ev" is later than prevEv in the applied order.
              winnerEv = ev;
              winnerValue = value;
            }

            // Push conflict record (always includes both candidates)
            const c1 = candidateOf(prevEv, prev.value);
            const c2 = candidateOf(ev, value);

            const winner = winnerEv.id === prevEv.id ? c1 : c2;
            // But if forced by resolution, winner might be chosen event that is neither prevEv nor ev
            // (rare for V0.1.2). Handle that:
            const forcedWinner: ConflictCandidate =
              winnerEv.id === prevEv.id
                ? c1
                : winnerEv.id === ev.id
                  ? c2
                  : candidateOf(winnerEv, winnerValue);

            conflicts.push({
              entityId,
              field,
              candidates: [c1, c2],
              winner: forcedWinner,
              resolved,
              resolvedByEventId,
              chosenEventId,
            });
          }
        }

        // Apply current write (normal projection)
        applyWrite(entityId, field, value, ev);

        // If a resolution exists for this field, enforce it immediately on the state
        // so "list" reflects user choice even if later events arrived.
        const res = resolutions[`${entityId}:${field}`];
        if (res) {
          const chosen = eventById[res.chosenEventId];
          if (
            chosen &&
            chosen.type === "StateUpdated" &&
            chosen.payload &&
            Object.prototype.hasOwnProperty.call(chosen.payload, field)
          ) {
            const chosenValue = (chosen.payload as any)[field];
            applyWrite(entityId, field, chosenValue, chosen);
          }
        }
      }
      continue;
    }

    // Keep existing optional event types as simple accumulators
    if (ev.type === "RelationAdded") {
      entities[entityId].relations = entities[entityId].relations || [];
      entities[entityId].relations.push(ev.payload);
      continue;
    }

    if (ev.type === "MetricRecorded") {
      entities[entityId].metrics = entities[entityId].metrics || [];
      entities[entityId].metrics.push(ev.payload);
      continue;
    }
  }

  return { entities, conflicts };
}