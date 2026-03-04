# Smo.OS External Anchoring
## MVP Specification v0.1

This document defines the first external anchoring format for Smo.OS.

---

## 1. Scope

v0.1 anchoring adds a standalone attestation record bound to one sealed segment.

Goals:
- Bind a segment root to an append-only anchor artifact
- Keep anchoring independent from segment manifests
- Provide deterministic local verification

Non-goals (MVP):
- Public blockchain integration
- RFC3161 timestamp authority integration
- Multi-backend witness quorum

---

## 2. Files

Anchors are stored under:

- `data/anchors/seg-XXXXXX.anchor.json`

One anchor file maps to one segment (`seg-XXXXXX`).

---

## 3. Anchor Record Format

Required fields:

- `version` (must be `0.1`)
- `backend` (must be `hash-attest-v1` for MVP)
- `segmentId`
- `segmentRoot`
- `origin`
- `keyId`
- `manifestCreatedAt`
- `anchoredAt`
- `anchorRef`
- `proof`

`proof` format:

- `type` (must be `hash-attestation`)
- `payloadHash`

---

## 4. Deterministic Anchor Hash

The attested payload is canonicalized with `json-stable-v1` and hashed with `sha-256`.

Payload fields:

- `version`
- `backend`
- `segmentId`
- `segmentRoot`
- `origin`
- `keyId`
- `manifestCreatedAt`
- `anchoredAt`

Rules:

- `anchorRef` MUST equal `sha256:<hex(payload)>`
- `proof.payloadHash` MUST equal the same value

---

## 5. Verification Requirements

Implementations MUST:

1. Load manifest for `segmentId`
2. Load matching anchor file
3. Check supported `version` and `backend`
4. Check `anchor.segmentRoot === manifest.root`
5. Check `origin` and `keyId` consistency with manifest
6. Recompute deterministic payload hash
7. Validate `anchorRef` and `proof.payloadHash`

Any failure MUST fail anchor verification.

---

## 6. CLI Commands

- `npm run crypto:anchor` (publish anchor for latest segment)
- `npm run crypto:anchor -- --segment seg-000001` (publish for explicit segment)
- `npm run crypto:anchor:verify` (verify anchor for latest segment)
- `npm run crypto:anchor:verify -- --segment seg-000001` (verify explicit segment)

---

## 7. Compatibility

This format is a new normative on-disk format and must follow compatibility policy rules.
