# Smo.OS Interoperability — Namespaces & Extensions Registry
## Draft Specification spec 0.1.0

This document defines how Smo.OS event namespaces and extension contracts are declared, versioned, distributed, and consumed for interoperability.

---

## 1. Scope

The registry standardizes:

- Namespace ownership and naming
- Event type declaration model
- Extension lifecycle and compatibility expectations
- Distribution and pinning rules for machine-readable registry snapshots

Non-goals (spec 0.1.0):

- Runtime capability authorization model
- Universal semantic validation of every extension payload field
- Governance process for legal/trademark namespace disputes

---

## 2. Terms

- **Namespace**: prefix of an event type, e.g. `plos.core` in `plos.core/EntityCreated`.
- **Extension**: set of event types under one namespace with a published spec.
- **Registry snapshot**: machine-readable artifact listing known namespaces.
- **Owner**: maintainer entity responsible for namespace semantics.
- **Stability status**: `experimental`, `stable`, or `deprecated`.

---

## 3. Event Type Naming Model

Event type format:

- `<namespace>/<EventName>`

### 3.1 Namespace syntax

Namespace MUST:

- be lowercase
- use dot-separated identifiers
- follow one of:
  - reserved protocol namespace (`plos.*`)
  - reverse-domain style for third parties (e.g. `org.example.finance`)

Namespace MUST NOT:

- contain spaces
- start or end with `.`
- include `/`

### 3.2 EventName syntax

`EventName` MUST:

- be PascalCase ASCII
- start with `[A-Z]`
- then `[A-Za-z0-9]*`

Examples:

- `plos.core/EntityCreated` ✅
- `org.example.habits/HabitChecked` ✅
- `org.example/checked_habit` ❌

---

## 4. Reserved Protocol Namespaces

Reserved namespaces in spec 0.1.0:

- `plos.core`
- `plos.security`

Rules:

1. Third-party implementations MUST NOT redefine semantics of reserved event types.
2. New reserved namespace definitions MUST be published in protocol docs before use.
3. Unknown `plos.*` namespaces SHOULD be treated as protocol-extension candidates and preserved like any unknown namespace.

---

## 5. Registry Artifact

Recommended path:

- `docs/protocol/registry/namespaces.json`

Top-level schema:

- `registryVersion` (registry schema version, string, canonical)
- `version` (legacy alias accepted during migration)
- `namespaces` (array)

Namespace entry schema:

- `namespace` (string, unique key)
- `owner` (string)
- `status` (`experimental` | `stable` | `deprecated`)
- `specVersion` (semver string for extension spec, canonical)
- `version` (legacy alias accepted during migration)
- `spec` (path or URL to normative specification)
- `eventTypes` (array of event names, without namespace prefix)
- `contact` (optional string)
- `compat` (optional object):
  - `backward` (boolean)
  - `notes` (optional string)

Uniqueness constraints:

- No duplicate `namespace` entries.
- `eventTypes` MUST be unique within one namespace entry.

---

## 6. Lifecycle and Compatibility

### 6.1 Experimental

- No compatibility guarantee across versions.
- Producers SHOULD avoid long-term archival dependence.

### 6.2 Stable

- Backward compatibility expected for readers across patch/minor extension versions.
- Breaking payload/semantic changes MUST bump extension major version.

### 6.3 Deprecated

- Producers SHOULD stop emitting new events.
- Consumers SHOULD continue reading historical events for a migration window.

### 6.4 Status transitions

Allowed transitions:

- `experimental -> stable`
- `stable -> deprecated`

Disallowed direct transition:

- `deprecated -> stable` (requires new major extension line or explicit governance exception)

---

## 7. Interoperability Rules

All compliant Smo.OS implementations MUST:

1. Preserve unknown namespaces during sync/transport/import/export.
2. Preserve unknown event payload bytes/fields as-is when re-emitting.
3. Keep canonical `plos.core/*` projection independent from unknown namespaces.
4. Avoid dropping unknown events solely because registry metadata is missing.

Implementations MAY:

- expose extension-specific projections in separate, non-canonical views
- apply optional extension validators when registry/spec metadata is available

---

## 8. Registry Distribution and Trust

Supported distribution modes:

- Embedded local registry shipped with implementation
- Remote registry snapshot imported into local cache

For remote snapshots, consumers SHOULD:

1. pin by checksum (`sha256:<hex>`)
2. store source metadata (URL, fetchedAt)
3. require explicit operator action before replacing a pinned stable snapshot

Consumers MUST fail safe if remote fetch/update is unavailable (continue with last trusted snapshot).

---

## 9. Runtime Consumption Model (Recommended)

When processing an event type `<namespace>/<EventName>`:

1. Parse namespace and event name syntactically.
2. If namespace is known in registry:
   - apply extension metadata (status/version/spec link)
   - optionally run extension validator
3. If unknown:
   - preserve event
   - mark as unknown extension in diagnostics
4. Never let unknown extension events mutate canonical behavior of `plos.core/*` resolution semantics.

---

## 10. Error Taxonomy (Recommended)

Registry-related machine-readable errors:

- `registry_invalid_schema`
- `registry_duplicate_namespace`
- `registry_invalid_event_name`
- `registry_unsupported_version`
- `registry_untrusted_snapshot`

Event-processing diagnostics:

- `extension_unknown_namespace`
- `extension_deprecated_event_emitted`

---

## 11. Minimal Conformance Scenarios

A future registry conformance suite SHOULD include:

1. Unknown namespace preservation across merge/sync
2. Canonical projection isolation from unknown namespaces
3. Duplicate namespace detection in registry file
4. Invalid event type naming rejection in registry ingestion
5. Deprecated namespace warning behavior
6. Pinned snapshot checksum mismatch rejection

---

## 12. Compatibility

- Adding new namespace entries is backward-compatible.
- Adding new event types under an `experimental` namespace MAY be breaking by extension policy.
- Changing semantics of a stable event type is breaking.
- Removing stable namespace entries is breaking unless previously deprecated with migration guidance.
