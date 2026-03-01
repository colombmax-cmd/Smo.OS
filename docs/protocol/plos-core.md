# PLOS Core Specification — Draft v0.1

## 1. Event Model

All state is represented as an append-only sequence of events.

Each event MUST contain:

- id: UUID
- type: EventType
- entityId: string
- payload: object
- timestamp: number
- origin: string
- seq: number
- seen: Record<string, number>

Events are immutable once written.

---

## 2. Ordering

Events are totally ordered using:

1. timestamp
2. origin (lexicographic)
3. seq
4. id

All compliant implementations MUST produce identical ordering.

---

## 3. Synchronization

Synchronization merges event logs by:

- union of events by id
- deterministic ordering
- no deletion

Logs are append-only.

---

## 4. Causality

Event causality is defined using `seen`.

Event A sees Event B if:

seen[B.origin] >= B.seq

Two events are concurrent if neither sees the other.

---

## 5. Conflict Detection

A conflict occurs when:

- same entityId
- same field
- different values
- concurrent events

---

## 6. Conflict Resolution

Resolution is append-only via:

EventType: ConflictResolved

Payload:
- field
- chosenEventId

Resolution MUST NOT modify previous events.

---

## 7. Projection

State is reconstructed by replaying events in order.

Resolved conflicts override default winners.

---

## 8. Conformance  

Smo.OS includes a deterministic conformance test suite located in /conformance.

An implementation claiming Smo.OS compatibility MUST pass the conformance suite.

The suite validates the following normative properties:

- Union by id: Event merge is a set union by event.id.
- Deterministic ordering: Events are ordered by timestamp, then origin (default "legacy"), then seq (default 0), then id.
- Canonical projection: Only plos.core/* events affect canonical state.
- Unknown preservation: Non-core namespaces MUST be preserved and synchronized.
- Conflict semantics: Concurrent writes to the same field produce a conflict.
- Conflict resolution: plos.core/ConflictResolved deterministically selects a winner.
- Causality via seen: If B declares A in seen, B is causally after A.
- Idempotence: Re-importing identical events does not alter canonical state.
- Commutativity: Merge result is independent of input ordering.

Conformance requirements apply to the current specification version.