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
  const sorted = [...events].sort(compareEvents).map(normalizeEvent);

  const entities: Record<string, any> = {};
  const conflicts: Conflict[] = [];

  const eventById: Record<string, Event> = {};

  // key = `${entityId}:${field}` -> resolution info
  const resolutions: Record<string, { chosenEventId: string; resolvedByEventId: string }> = {};

  // ---------- PASS 1: index + collect resolutions ----------
  for (const ev of sorted) {
    eventById[ev.id] = ev;

    if (ev.type === "ConflictResolved") {
      const field = ev.payload?.field;
      const chosenEventId = ev.payload?.chosenEventId;
      if (typeof field === "string" && typeof chosenEventId === "string") {
        resolutions[`${ev.entityId}:${field}`] = {
          chosenEventId,
          resolvedByEventId: ev.id,
        };
      }
    }
  }

  // ---------- PASS 2: rebuild state + detect conflicts ----------
  const lastWrite: Record<string, { value: any; event: Event }> = {};

  const candidateOf = (ev: Event, value: any): ConflictCandidate => ({
    value,
    eventId: ev.id,
    origin: ev.origin,
    seq: ev.seq,
    timestamp: ev.timestamp,
  });

  const applyWrite = (entityId: string, field: string, value: any, ev: Event) => {
    if (!entities[entityId]) entities[entityId] = { id: entityId };
    entities[entityId][field] = value;
    lastWrite[`${entityId}:${field}`] = { value, event: ev };
  };

  for (const ev of sorted) {
    const entityId = ev.entityId;
    if (!entities[entityId]) entities[entityId] = { id: entityId };

    // ConflictResolved doesn't directly change state here; it's applied via enforcement below
    if (ev.type === "ConflictResolved") continue;

    if (ev.type === "EntityCreated") {
      for (const [k, v] of Object.entries(ev.payload ?? {})) {
        applyWrite(entityId, k, v, ev);
      }
      continue;
    }

    if (ev.type === "StateUpdated") {
      for (const [field, value] of Object.entries(ev.payload ?? {})) {
        const key = `${entityId}:${field}`;
        const prev = lastWrite[key];

        // detect real concurrent conflict
        if (prev) {
          const prevEv = prev.event;
          const differentOrigin = prevEv.origin !== ev.origin;
          const differentValue = prev.value !== value;

          if (differentOrigin && differentValue && concurrent(prevEv, ev)) {
            const res = resolutions[key];

            let forcedWinnerCandidate: ConflictCandidate | null = null;
            let resolved = false;
            let resolvedByEventId: string | undefined = undefined;
            let chosenEventId: string | undefined = undefined;

            if (res) {
              resolved = true;
              resolvedByEventId = res.resolvedByEventId;
              chosenEventId = res.chosenEventId;

              const chosen = eventById[res.chosenEventId];
              if (
                chosen &&
                chosen.type === "StateUpdated" &&
                chosen.payload &&
                Object.prototype.hasOwnProperty.call(chosen.payload, field)
              ) {
                forcedWinnerCandidate = candidateOf(chosen, (chosen.payload as any)[field]);
              }
            }

            const c1 = candidateOf(prevEv, prev.value);
            const c2 = candidateOf(ev, value);

            // Default winner (deterministic): later in applied order, i.e. current ev
            let winner = c2;

            // If resolved, force winner to chosen event
            if (forcedWinnerCandidate) {
              winner = forcedWinnerCandidate;
            }

            conflicts.push({
              entityId,
              field,
              candidates: [c1, c2],
              winner,
              resolved,
              resolvedByEventId,
              chosenEventId,
            });
          }
        }

        // Apply current write
        applyWrite(entityId, field, value, ev);

        // Enforce resolution (if any) on the state immediately
        const res = resolutions[key];
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