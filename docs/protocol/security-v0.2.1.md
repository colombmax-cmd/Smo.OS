# Smo.OS Security Layer
## Version 0.2.1

This document defines the cryptographic integrity model for Smo.OS.

---

## 1. Scope

v0.2.1 provides protection against:

- External modification of sealed segments
- Event tampering within a segment
- Segment deletion inside a chain

v0.2.1 does NOT protect against:

- Private key compromise
- Operator re-signing after rewrite
- External timestamp guarantees

---

## 2. Segment Model

Each segment consists of:

- `seg-XXXXXX.jsonl`
- `seg-XXXXXX.manifest.json`

Segments are immutable once sealed.

---

## 3. Canonicalization

Algorithm: `json-stable-v1`

- Recursive key sorting
- UTF-8 encoding
- Deterministic serialization

---

## 4. Hashing

Hash function: `SHA-256`

Each event is hashed individually.

Leaf:

SHA256(canonical_event_json)


Merkle rule:
- Pairwise hashing
- Duplicate last leaf if odd

---

## 5. Root

Segment root format:
```bash
sha256:<64 lowercase hex chars>


---

## 6. Signature

Algorithm: `Ed25519`

The signature covers the manifest with the `signature` field empty.

---

## 7. Manifest Fields

Required:

- `version`
- `origin`
- `keyId`
- `root`
- `prevSegmentRoot`
- `algo`
- `signature`

---

## 8. Verification Requirements

Implementations MUST:

- Reject unsupported version
- Reject unsupported algorithms
- Reject malformed root
- Verify Merkle root
- Verify signature using `keyId`
- Verify chain consistency

Failure MUST result in verification failure.

---

## 9. Algorithm Support (v0.2.1)

Required:

- canonical: `json-stable-v1`
- hash: `sha-256`
- merkle: `pairwise-dup-last`
- sig: `ed25519`

Future versions MAY extend this set.