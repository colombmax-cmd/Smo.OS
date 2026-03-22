# Smo.OS Key Rotation Workflows
## Version 0.1

This document defines the first operational workflow for key rotation in Smo.OS.

---

## 1. Scope

v0.1 provides a local deterministic workflow to rotate the active Ed25519 signer key.

Goals:
- Keep historical verification valid
- Prevent old keys from signing new segments after rotation
- Preserve an append-only key lineage through `replaces`

---

## 2. CLI

- `npm run crypto:key:rotate`
- `npm run crypto:key:rotate -- --origin <origin>`

---

## 3. Registry Transition Rules

On rotation at `rotatedAt`:

1. current `activeKeyId` becomes `retired`
2. retired key gets `notAfter = rotatedAt`
3. a new key pair is generated and written under `shared-store/keys/`
4. new key entry is added with:
   - `status: active`
   - `notBefore = rotatedAt`
   - `replaces = <oldKeyId>`
5. `activeKeyId` points to the new key

---

## 4. Verification Expectations

Given strict segment verification:

- manifests signed before `notAfter` of old key remain valid
- manifests created after old key `notAfter` using old key MUST fail
- manifests created after rotation with new key MUST pass

---

## 5. Conformance

`npm run conformance:crypto:rotation` validates:

- happy path (`seg-1` with old key, `seg-2` with new key)
- failure case where post-rotation segment is forced to old key
