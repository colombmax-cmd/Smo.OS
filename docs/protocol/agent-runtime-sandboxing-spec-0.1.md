# Agent Runtime Sandboxing Specification v0.1.0 (Draft)

Status: draft  
Target: Agent Runtime Safety pillar

## 1. Purpose

This specification defines a baseline sandboxing model for agent runtime execution in Smo.OS.
It provides:

- process isolation boundaries,
- a capability-first permission model,
- deterministic policy evaluation,
- mandatory auditability for sensitive actions.

The objective is to reduce blast radius from prompt injection, tool misuse, or compromised dependencies while keeping an implementation path pragmatic for CLI/server runtimes.

## 2. Design goals

1. **Deny-by-default**: no side effect is allowed unless explicitly granted.
2. **Least privilege**: capabilities are scoped by action, resource, and time.
3. **Deterministic enforcement**: same input policy and request MUST produce the same decision.
4. **Explainability**: deny decisions MUST include machine-readable reason codes.
5. **Auditability**: every high-risk call MUST emit a tamper-evident audit record.
6. **Progressive adoption**: compatible with existing transport/CLI layers.

## 3. Non-goals (v0.1.0)

- Full hardware VM isolation requirements.
- Multi-tenant billing or quota management.
- Human approval UX standardization (only policy interfaces are standardized).
- Host-specific syscall profile standardization (implementations MAY differ).

## 4. Threat model summary

The sandbox MUST mitigate at least:

- **Prompt-injection-driven exfiltration** (reading unrelated local or remote secrets).
- **Unauthorized mutation** (filesystem writes, process execution, network calls).
- **Privilege escalation via tool chaining**.
- **Replay of previously granted broad permissions** beyond intended TTL/scope.

Out of scope but documented:

- Kernel-level escapes in compromised hosts.
- Side-channel attacks requiring hardware controls.

## 5. Runtime isolation model

Each agent invocation runs in a **Sandbox Context** with immutable identity:

```text
SandboxContext {
  run_id: string,
  actor_id: string,
  policy_version: string,
  created_at: RFC3339,
  expires_at: RFC3339,
  mode: "strict" | "compat"
}
```

### 5.1 Isolation boundary requirements

An implementation MUST provide all of the following logical controls:

- **Filesystem guard**: path allow/deny evaluation before read/write/execute.
- **Process guard**: command allowlist and argument validation.
- **Network guard**: destination allowlist by scheme + host + optional port.
- **Secret guard**: explicit capability required to access any secret material.

Implementation note: these controls can be realized via container sandboxing, OS policies, brokered tool APIs, or a combination.

### 5.2 Modes

- `strict` (default): deny-by-default for all side effects.
- `compat`: legacy-safe mode that allows configured compatibility exceptions, but MUST log `compat_exception_used=true`.

## 6. Capability model

A **capability** is a tuple:

```text
Capability {
  id: string,
  action: string,
  resource: string,
  constraints?: object,
  ttl_s: number,
  delegable: boolean
}
```

### 6.1 Canonical action namespaces

- `fs.read`, `fs.write`, `fs.exec`
- `proc.spawn`
- `net.connect`
- `secret.read`
- `registry.query`
- `audit.append`

New action namespaces MUST use reverse-DNS or `vendor.*` naming to avoid collisions.

### 6.2 Resource grammar

- Filesystem: `file://<abs-path-or-prefix>`
- Network: `net://<scheme>/<host>[:port]`
- Process: `proc://<binary-name>`
- Secret: `secret://<namespace>/<name>`

Wildcard support:

- `*` only allowed at suffix boundary, e.g. `file:///workspace/*`.
- global wildcard `*` is forbidden in `strict` mode.

## 7. Permission policy schema

A policy document MUST be serializable and versioned.

```json
{
  "policy_version": "0.1.0",
  "default_effect": "deny",
  "rules": [
    {
      "id": "allow-workspace-read",
      "effect": "allow",
      "action": "fs.read",
      "resource": "file:///workspace/Smo.OS/*",
      "constraints": {
        "max_bytes": 5000000
      }
    }
  ]
}
```

### 7.1 Rule evaluation order

1. Validate request schema.
2. Collect matching rules by action/resource.
3. Apply explicit denies first.
4. Apply allows with constraints.
5. Fallback to `default_effect`.

### 7.2 Reason codes (minimum set)

- `DENY_DEFAULT`
- `DENY_EXPLICIT`
- `DENY_CONSTRAINT_TTL`
- `DENY_CONSTRAINT_RESOURCE`
- `DENY_MODE_STRICT`
- `ALLOW_RULE_MATCH`

## 8. Permission lifecycle

### 8.1 Issuance

Capabilities MAY be issued by:

- bootstrap policy,
- trusted control plane,
- interactive user grant.

All issued capabilities MUST include `ttl_s` and a non-reusable `capability_instance_id`.

### 8.2 Delegation

Delegation is allowed only if `delegable=true` and delegated TTL is strictly less than parent TTL.

### 8.3 Revocation

Runtime MUST support asynchronous revocation and apply it at next guard check.

## 9. Audit trail requirements

Every guarded decision MUST emit an audit event with at minimum:

```json
{
  "ts": "RFC3339",
  "run_id": "string",
  "actor_id": "string",
  "request": {
    "action": "string",
    "resource": "string"
  },
  "decision": "allow|deny",
  "reason_code": "string",
  "policy_version": "string",
  "capability_instance_id": "string|null",
  "compat_exception_used": false,
  "event_hash": "sha256-...",
  "prev_event_hash": "sha256-...|null"
}
```

The hash chain (`event_hash`, `prev_event_hash`) SHOULD be contiguous per `run_id` to make tampering detectable.

## 10. Safety invariants

Implementations claiming conformance MUST satisfy:

1. No side-effectful action executes without a prior `allow` decision.
2. A denied action cannot be retried with broader scope unless policy/capability changed.
3. Expired capability is treated as absent.
4. `strict` mode forbids global wildcard resources.
5. Audit records are append-only within a run.

## 11. Error handling

On policy engine failure, runtimes MUST:

- fail closed (`deny`),
- emit `reason_code=DENY_DEFAULT`,
- include diagnostic metadata in a non-sensitive field.

## 12. Compatibility with existing Smo.OS artifacts

- No change required for core event model serialization.
- Transport and CLI layers MAY carry sandbox headers/flags as optional metadata.
- Future versions SHOULD define wire-level negotiation for remote runtimes.

## 13. Conformance profile (initial)

A v0.1.0 conformance suite SHOULD include:

1. deny-by-default cases,
2. explicit allow with resource prefix,
3. TTL expiry behavior,
4. strict-mode wildcard rejection,
5. revocation propagation,
6. audit hash-chain continuity.

## 14. Migration guidance

For existing deployments without sandboxing:

1. Start in `compat` mode with full audit capture.
2. Observe top denied intents and create minimal allow rules.
3. Remove compatibility exceptions incrementally.
4. Switch to `strict` mode as default.

## 15. Versioning

This draft follows the repository versioning convention and is intentionally scoped as `0.1.0` to capture a stable minimum contract for sandboxing behavior.
