# Smo.OS Interoperability — Transport Protocol
## Draft Specification spec 0.1.0

This document defines the baseline protocol used by two Smo.OS nodes to exchange events and sealed segments deterministically.

---

## 1. Scope

spec 0.1.0 standardizes:

- Peer capability discovery
- Pull-based incremental event synchronization
- Optional pull-based sealed segment synchronization
- Error model and compatibility rules

Non-goals (spec 0.1.0):

- Network peer discovery/federation
- Push subscriptions (WebSocket/SSE)
- Identity/authentication handshake design

---

## 2. Terminology

- **Producer**: node serving transport responses.
- **Consumer**: node requesting and importing remote data.
- **Cursor**: map `origin -> lastSeqReceived` used for incremental pulls.
- **Core ordering**: deterministic ordering from `plos-core.md`:
  1. `timestamp`
  2. `origin` (lexicographic)
  3. `seq`
  4. `id`

---

## 3. Wire Envelope

Every request/response body MUST use this envelope:

```json
{
  "protocol": "plos.transport/0.1",
  "type": "plos.transport/<message>",
  "requestId": "<opaque-id>",
  "sentAt": 1735689600000,
  "payload": {}
}
```

Required fields:

- `protocol`: MUST equal `plos.transport/0.1`
- `type`: message type string
- `requestId`: client-generated correlation id
- `sentAt`: unix epoch ms
- `payload`: object (message-specific)

Rules:

1. Unknown `protocol` MUST be rejected.
2. Responses MUST echo the same `requestId`.
3. Unknown top-level envelope fields MUST be ignored.

---

## 4. Transport Binding (HTTP Profile)

spec 0.1.0 defines a normative HTTP binding for interoperability testing.

- Method: `POST`
- Content-Type: `application/json`
- Request path: implementation-defined (recommended `/transport`)
- Body: transport envelope JSON

HTTP status guidance:

- `200`: protocol-level success (`*.ok`)
- `400`: malformed envelope/payload
- `404`: unknown endpoint
- `413`: request exceeds server limit
- `500`: unexpected server failure

Even on non-`200`, server SHOULD return `plos.transport/error` envelope when possible.

---

## 5. Capability Discovery

### 5.1 Request

`type = "plos.transport/hello"`

Payload:

- `nodeId` (string)
- `supports` (object):
  - `eventsPull` (boolean)
  - `segmentsPull` (boolean)
  - `bundlesPull` (boolean)

### 5.2 Response

`type = "plos.transport/hello.ok"`

Payload:

- `nodeId` (string)
- `supports` (same shape)
- `limits`:
  - `maxEventsPerResponse` (integer >= 1)
  - `maxBytesPerResponse` (integer >= 1)
  - `maxSegmentBytes` (optional integer >= 1)

Consumers MUST cache peer capabilities for the sync session and MUST NOT call unsupported APIs.

---

## 6. Event Synchronization

### 6.1 Request

`type = "plos.transport/events.pull"`

Payload:

- `cursorByOrigin` (optional map `string -> integer`)
- `namespaceFilter` (optional array of namespace prefixes)
- `limit` (optional integer >= 1)

Cursor semantics:

- Missing origin key means "nothing received yet" for that origin.
- For origin `X`, server MUST only return events where `seq > cursorByOrigin[X]`.

### 6.2 Success Response

`type = "plos.transport/events.pull.ok"`

Payload:

- `events` (array of raw events in canonical schema)
- `nextCursorByOrigin` (map `string -> integer`)
- `hasMore` (boolean)

Normative rules:

1. Events MUST be unique by `id`.
2. Events MUST be ordered by core ordering.
3. `nextCursorByOrigin` MUST be monotonic relative to request cursor.
4. If the response is truncated by server limits, `hasMore` MUST be `true`.
5. If `events` is empty and no additional events are available, `hasMore` MUST be `false`.

### 6.3 Namespace Filtering

If `namespaceFilter` is provided:

- Server MUST include events whose `type` namespace starts with one of the provided prefixes.
- Server MUST preserve ordering and cursor monotonicity on the returned subset.
- Consumers MUST treat filtered pulls as partial views and MUST NOT assume global completeness.

---

## 7. Sealed Segment Synchronization

This API is optional and only valid when peer capability `segmentsPull=true`.

### 7.1 Manifest Pull

Request type: `plos.transport/segments.manifests.pull`

Payload:

- `fromSegmentId` (optional string)
- `limit` (optional integer >= 1)

Response type: `plos.transport/segments.manifests.pull.ok`

Payload:

- `manifests` (ordered array)
- `hasMore` (boolean)

Order MUST be ascending by segment sequence.

### 7.2 Segment Content Pull

Request type: `plos.transport/segments.content.pull`

Payload:

- `segmentId` (required string)

Response type: `plos.transport/segments.content.pull.ok`

Payload:

- `segmentId`
- `eventsJsonl` (UTF-8 exact segment bytes)
- `manifest` (matching manifest)

Consumer import requirements:

1. Verify `manifest.segmentId == segmentId`.
2. Verify segment integrity and signature per `security-v0.2.1`.
3. Reject import on any verification failure.

---

## 8. Error Model

Error response type: `plos.transport/error`

Payload:

- `code`:
  - `bad_request`
  - `unsupported_type`
  - `unsupported_capability`
  - `cursor_invalid`
  - `limit_exceeded`
  - `internal_error`
- `message` (human-readable)
- `retryable` (optional boolean)

Normative rules:

1. Unknown request `type` MUST return `unsupported_type`.
2. Calling an unsupported API MUST return `unsupported_capability`.
3. Invalid cursor formats/values MUST return `cursor_invalid`.

---

## 9. Compatibility Rules

- New optional fields MAY be added to message payloads.
- Existing required fields MUST NOT change semantics in patch releases.
- Breaking payload/envelope changes MUST bump protocol version (`plos.transport/x.y`).
- Implementations SHOULD fail closed on unknown protocol version.

---

## 10. Security Considerations

- Transport security is deployment-defined; production deployments SHOULD use authenticated channels (mTLS, VPN, equivalent).
- Imported events MUST pass local schema validation and deterministic replay rules.
- Imported segments MUST pass strict cryptographic verification before persistence.
- Implementations SHOULD apply rate limits and payload size limits to reduce abuse risk.
