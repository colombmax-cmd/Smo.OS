# Smo.OS Key Registry Format
## Version 0.1

This document defines the on-disk key registry schema used by Smo.OS.

---

## 1. Scope

The registry provides key discovery metadata for signature verification and key lifecycle management.

Primary file path:

- `data/keys/registry.json`

---

## 2. Top-level schema

```json
{
  "version": "0.1",
  "activeKeyId": "default#ed25519-1",
  "keys": {
    "default#ed25519-1": {
      "origin": "default",
      "alg": "ed25519",
      "pubPath": "data/keys/ed25519.pub.pem",
      "status": "active",
      "createdAt": 1730000000000,
      "notBefore": 1730000000000
    }
  }
}
```

Required top-level fields:

- `version`: schema version string
- `activeKeyId`: currently active signer key id
- `keys`: map of `keyId -> KeyEntry`

---

## 3. Key entry schema (`KeyEntry`)

Required fields:

- `origin`: logical origin owner of the key
- `alg`: signing algorithm (`ed25519`)
- `pubPath`: relative path to PEM public key
- `status`: `active | retired | revoked`
- `createdAt`: creation timestamp (ms epoch)
- `notBefore`: validity start timestamp (ms epoch)

Optional fields:

- `notAfter`: validity end timestamp (ms epoch)
- `replaces`: previous key id in rotation chain
- `revokedAt`: revocation timestamp (ms epoch)
- `reason`: free-form revocation/rotation reason

---

## 4. Lifecycle semantics

- `active`: key can be used for signing and verification.
- `retired`: key should not be used for new signing, but can remain valid for historical verification.
- `revoked`: key must be considered compromised/invalid under strict verification policies.

Detailed enforcement semantics are defined by verifier policy (see security/compat docs and implementation).

---

## 5. Backward compatibility

Legacy registries without `version` may be normalized to v0.1 at load time.

Legacy shape:

```json
{
  "active": "default#ed25519-1",
  "keys": {
    "default#ed25519-1": {
      "origin": "default",
      "alg": "ed25519",
      "pubPath": "data/keys/ed25519.pub.pem"
    }
  }
}
```

Normalization rules:

- `active` -> `activeKeyId`
- migrated active key gets `status: active`
- other keys get `status: retired`
- `createdAt` and `notBefore` are initialized at migration time

---

## 6. Evolution policy

- Additive optional fields are preferred over field replacement.
- Breaking schema changes must bump the schema version and provide migration guidance.
