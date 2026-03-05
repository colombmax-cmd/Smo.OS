# Smo.OS Interoperability — Portable Bundles
## Draft Specification spec 0.1.0

This document defines a deterministic offline export/import format for Smo.OS data portability.

---

## 1. Scope

Portable bundles enable:

- Offline transfer between nodes
- Long-term archival portability
- Interoperable import/export across implementations
- Deterministic package reproduction from identical source material

Supported payload classes (spec 0.1.0):

- Event log payloads
- Sealed segments and manifests
- Optional anchor artifacts
- Bundle-level metadata and checksums

Non-goals (spec 0.1.0):

- Encrypted bundle profile
- Differential/incremental patch bundles
- Streaming transport framing
- Remote trust/discovery protocols

---

## 2. Terms

- **Producer**: implementation generating a bundle.
- **Consumer**: implementation importing a bundle.
- **Profile**: logical content mode (`events-only`, `segments-only`, `hybrid`).
- **Entry path**: relative path of a file inside archive root.
- **Normalized bytes**: UTF-8 bytes with line endings normalized to `\n`.

---

## 3. Physical Format

Bundle extension:

- `.plosbundle`

Archive format:

- ZIP (single-file archive)
- UTF-8 entry paths
- No absolute paths

### 3.1 Required entries

A bundle MUST contain:

- `bundle.json`
- at least one payload root:
  - `events/events.jsonl` OR
  - `segments/` directory with at least one segment pair

### 3.2 Optional entries

- `anchors/<segmentId>.anchor.json`
- `meta/*`

### 3.3 Segment pair rule

If `segments/` is present, each exported segment id `seg-XXXXXX` MUST include both:

- `segments/seg-XXXXXX.jsonl`
- `segments/seg-XXXXXX.manifest.json`

Missing either file is invalid.

---

## 4. `bundle.json` Manifest

Required fields:

- `specVersion`: MUST be `0.1.0` (canonical)
- `bundleVersion`: MAY be present as legacy alias and, if present, MUST be `0.1` or `0.1.0`
- `createdAt`: unix epoch milliseconds
- `createdBy`: producer identifier
- `exportProfile`: one of `events-only` | `segments-only` | `hybrid`
- `content`:
  - `eventCount` (integer >= 0)
  - `segmentCount` (integer >= 0)
  - `anchorCount` (integer >= 0)
- `spec`:
  - `core` (string)
  - `security` (optional string)
  - `anchoring` (optional string)
- `checksums`: map `entryPath -> sha256:<hex>`

Recommended fields:

- `sourceNodeId`
- `description`
- `filters` (when export is partial)

### 4.1 Manifest/profile consistency

- `events-only` profile MUST have `segmentCount = 0`.
- `segments-only` profile MAY have `eventCount = 0` (if no `events/events.jsonl` exported).
- `hybrid` MAY include both payload classes.
- `anchorCount > 0` implies `segments/` is present.

---

## 5. Determinism Rules

Producer MUST:

1. Serialize `bundle.json` with deterministic canonical JSON (`json-stable-v1`).
2. Normalize all text payloads (`.json`, `.jsonl`) to `\n` endings.
3. Sort ZIP entries lexicographically by `entryPath` before archive finalization.
4. Compute checksum values over exact normalized bytes written to archive.
5. Use lowercase SHA-256 hex and prefix `sha256:`.

Producer SHOULD:

- Ensure reproducible timestamps when deterministic rebuild mode is requested.
- Avoid embedding host-specific metadata in payload files.

---

## 6. Checksums

`checksums` map in `bundle.json`:

- Keys: relative archive paths (excluding `bundle.json` itself RECOMMENDED)
- Values: `sha256:<64-lowercase-hex>`

Validation rules:

1. Every listed checksum entry MUST exist in archive.
2. Every required payload file MUST be listed in `checksums`.
3. On mismatch, import MUST fail by default.

---

## 7. Import Validation Pipeline

Consumer MUST execute the following steps in order:

1. **Archive shape**: validate required files and path constraints.
2. **Version gate**: reject unsupported `specVersion` (fallback to legacy `bundleVersion` if needed).
3. **Manifest schema**: validate required fields and value ranges.
4. **Checksum verification**: recompute and compare all required entries.
5. **Payload schema**:
   - parse event JSONL entries
   - validate event structural envelope
6. **Security validation**:
   - if segments are present: run strict segment verification (`security-v0.2.1`)
   - if anchors are present: verify each anchor against its manifest
7. **Import application**: merge accepted data into local store.

Any failure in steps 1–6 MUST abort import unless an explicit unsafe flag is provided by implementation policy.

---

## 8. Partial Export and Partial Import

Implementations MAY support filtering by:

- namespace prefixes
- origins
- timestamp ranges
- segment id ranges

When filters are used, producer SHOULD record them under `bundle.json.filters`.

Consumers performing partial import MUST persist an import report including:

- source bundle identity (`createdAt`, `createdBy`, checksum of `bundle.json`)
- applied selectors
- accepted/rejected counts by class (`events`, `segments`, `anchors`)
- first fatal validation error (if any)

---

## 9. Security and Privacy Considerations

- Bundles are plaintext by default and may expose sensitive personal data.
- Producers SHOULD support external encryption/signing workflows at rest/in transit.
- Consumers SHOULD import bundles in a staging area before committing to live storage.
- Consumers SHOULD cap max archive size and max file count to reduce abuse risk.

---

## 10. Error Taxonomy (Recommended)

Implementations SHOULD expose machine-readable import errors:

- `bundle_invalid_structure`
- `bundle_unsupported_version`
- `bundle_manifest_invalid`
- `bundle_checksum_mismatch`
- `bundle_payload_invalid`
- `bundle_segment_verify_failed`
- `bundle_anchor_verify_failed`

---

## 11. Minimal Conformance Scenarios

A future bundle conformance suite SHOULD include at least:

1. Valid `events-only` bundle import
2. Valid `segments-only` bundle import
3. Checksum mismatch rejection
4. Missing segment pair rejection
5. Unsupported `specVersion`/legacy `bundleVersion` rejection
6. Anchor/manifest mismatch rejection
7. Deterministic re-export equivalence check

---

## 12. Compatibility

- New optional files MAY be added under new top-level directories.
- Existing required entry paths and semantics are stable for `specVersion = 0.1.0` (or legacy `bundleVersion = 0.1`/`0.1.0`).
- Breaking changes to required structure or validation MUST bump `specVersion` (and legacy alias when emitted).
