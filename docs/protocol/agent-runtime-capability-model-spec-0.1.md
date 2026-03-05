# Agent Runtime Capability Model Specification v0.1.0 (Draft)

Status: draft  
Target: Agent Runtime Safety pillar

## 1. Purpose

This specification defines how capabilities are represented, issued, delegated, validated, revoked, and audited for agent runtimes in Smo.OS.

A capability is a cryptographically verifiable or policy-bound authorization token that grants a constrained action on a constrained resource for a constrained duration.

## 2. Design objectives

1. **Least privilege by construction**: capability scope is explicit and narrow.
2. **Deterministic validation**: same capability + request + policy context MUST yield the same decision.
3. **Temporal safety**: every capability MUST expire.
4. **Composability**: capability model MUST integrate with sandbox policy rules.
5. **Traceability**: all capability-driven decisions MUST be auditable.

## 3. Terminology

- **Capability**: authorization object containing `action`, `resource`, `constraints`, and identity metadata.
- **Capability Instance**: concrete issued copy of a capability, uniquely identifiable and revocable.
- **Parent capability**: capability from which another capability is delegated.
- **Capability Set**: runtime collection of active capability instances associated with a run.
- **Grantor**: trusted component issuing or delegating a capability.
- **Bearer**: runtime actor using the capability.

## 4. Capability schema (normative)

A runtime capability instance MUST expose the following fields:

```json
{
  "capability_instance_id": "cap-01HF...",
  "capability_id": "net-read-1",
  "issuer": "control-plane://local",
  "subject": "agent://planner",
  "action": "net.connect",
  "resource": "net://https/api.example.com:443",
  "constraints": {
    "max_calls": 10,
    "max_bytes": 2000000,
    "allowed_methods": ["GET"],
    "not_before": "2026-01-01T10:00:00Z",
    "not_after": "2026-01-01T10:15:00Z"
  },
  "delegable": false,
  "parent_capability_instance_id": null,
  "issued_at": "2026-01-01T10:00:00Z",
  "revoked": false,
  "meta": {
    "reason": "fetch remote context"
  }
}
```

### 4.1 Required fields

- `capability_instance_id` (string, unique, non-reusable)
- `capability_id` (string, stable identifier for logical grant family)
- `issuer` (string)
- `subject` (string)
- `action` (string)
- `resource` (string)
- `delegable` (boolean)
- `issued_at` (RFC3339 timestamp)
- `revoked` (boolean)

### 4.2 Optional fields

- `constraints` (object)
- `parent_capability_instance_id` (string|null)
- `meta` (object)

## 5. Canonical action/resource model

### 5.1 Action namespaces

Canonical action namespaces SHOULD include:

- `fs.read`, `fs.write`, `fs.exec`
- `proc.spawn`
- `net.connect`
- `secret.read`
- `registry.query`
- `audit.append`

Custom actions MUST use collision-safe namespace patterns (e.g. `vendor.product.action`).

### 5.2 Resource URI grammar

- Filesystem: `file://<abs-path-or-prefix>`
- Network: `net://<scheme>/<host>[:port]`
- Process: `proc://<binary-name>`
- Secret: `secret://<namespace>/<name>`
- Runtime-internal: `runtime://<component>/<operation>`

Wildcard rules:

- `*` allowed only as suffix wildcard (prefix match semantics).
- full wildcard `*` MUST be rejected in strict mode.

## 6. Constraint model

`constraints` MAY define domain-specific restrictions. Implementations MUST ignore unknown keys only if policy allows forward-compat mode; otherwise, they MUST deny.

Recommended baseline constraints:

- `not_before`, `not_after` (temporal bounds)
- `max_calls` (integer)
- `max_bytes` (integer)
- `allowed_methods` (array for net/process adapters)
- `path_prefixes` (array for additional file safety)

## 7. Capability lifecycle

### 7.1 Issuance

A capability instance MUST be issued by a trusted grantor and validated against runtime policy before insertion into active capability set.

Issuance MUST enforce:

1. unique `capability_instance_id`,
2. bounded lifetime (`not_after` required directly or derived by TTL policy),
3. action/resource format validity,
4. issuer authorization.

### 7.2 Delegation

Delegation is allowed only if:

- parent capability has `delegable=true`,
- delegated scope is a strict subset of parent scope,
- delegated expiration is <= parent expiration,
- chain depth does not exceed implementation policy.

Delegated instance MUST set `parent_capability_instance_id`.

### 7.3 Revocation

Runtime MUST support asynchronous revocation and treat revoked capability as immediately invalid at next guard check.

Revocation sources MAY include:

- control plane signal,
- policy update,
- incident response kill-switch.

### 7.4 Expiry

Expired capability instances MUST be treated as absent and SHOULD be garbage-collected from active set.

## 8. Validation algorithm (normative order)

For a guarded request `(action, resource, context)`:

1. collect candidate capabilities matching action and resource,
2. discard revoked capabilities,
3. discard expired/not-yet-valid capabilities,
4. validate constraints (`max_calls`, `max_bytes`, etc.),
5. if >=1 valid capability remains, capability check result is `ALLOW_CAPABILITY`,
6. otherwise capability check result is `DENY_CAPABILITY`.

Then combine with policy engine:

- explicit policy deny MUST override capability allow,
- explicit policy allow MAY allow even without capability depending on runtime policy profile,
- default deny applies if neither model grants access.

## 9. Security invariants

Conformant implementations MUST guarantee:

1. Capability instance IDs are unique and non-reusable.
2. Revoked or expired capability can never authorize an action.
3. Delegation cannot widen privileges.
4. Strict mode rejects global wildcard resources.
5. Capability validation failures fail closed.

## 10. Audit requirements

Each capability evaluation MUST emit an audit event with at least:

```json
{
  "ts": "RFC3339",
  "run_id": "string",
  "actor_id": "string",
  "request": { "action": "string", "resource": "string" },
  "capability_instance_id": "string|null",
  "decision": "allow|deny",
  "reason_code": "ALLOW_CAPABILITY|DENY_CAPABILITY|DENY_EXPLICIT|DENY_DEFAULT",
  "constraint_failures": ["max_calls"],
  "event_hash": "sha256-...",
  "prev_event_hash": "sha256-...|null"
}
```

Audit records SHOULD be append-only and hash-chained per run.

## 11. Error model

Minimum reason-code set for capability layer:

- `DENY_CAPABILITY_NONE`
- `DENY_CAPABILITY_REVOKED`
- `DENY_CAPABILITY_EXPIRED`
- `DENY_CAPABILITY_NOT_BEFORE`
- `DENY_CAPABILITY_CONSTRAINT`
- `ALLOW_CAPABILITY`

On evaluator internal error, implementation MUST deny and emit a non-sensitive diagnostic marker.

## 12. Interoperability profile

To improve cross-runtime compatibility, implementations SHOULD:

- preserve unknown fields in capability serialization,
- normalize timestamps to RFC3339 UTC,
- maintain stable action/resource grammar,
- expose capability reason codes in transport-safe error payloads.

## 13. Conformance profile (v0.1.0)

A minimal conformance suite SHOULD include tests for:

1. deny when no capability matches,
2. allow on valid capability,
3. deny after expiry,
4. deny after revocation,
5. delegation subset enforcement,
6. strict-mode wildcard rejection,
7. audit chain continuity.

## 14. Migration guidance

For current deployments:

1. start with observation mode (evaluate + audit, no enforcement),
2. identify broad grants and split by action/resource,
3. introduce mandatory expiry,
4. enable enforcement in strict mode,
5. automate revocation from incident workflows.

## 15. Versioning

This document introduces an initial stable contract at `0.1.0` for capability semantics and lifecycle behavior.
