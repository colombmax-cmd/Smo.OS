# Agent Runtime Permission System Specification v0.1.0 (Draft)

Status: draft  
Target: Agent Runtime Safety pillar

## 1. Purpose

This specification defines the permission system for agent runtimes in Smo.OS, including:

- permission object schema,
- policy layering and precedence,
- grant/deny evaluation semantics,
- permission lifecycle (grant, review, revoke, expiry),
- audit and explainability requirements.

The goal is to provide deterministic, least-privilege control over runtime actions while remaining composable with sandboxing and capabilities.

## 2. Design goals

1. **Deny-by-default** for side-effectful actions.
2. **Deterministic evaluation** for reproducibility and incident analysis.
3. **Least privilege** by scope (action/resource/constraints/time).
4. **Separation of concerns** between policy, capabilities, and runtime enforcement.
5. **Auditable decisions** with explicit reason codes.

## 3. Permission model overview

A permission decision is produced by combining three layers:

1. **Static policy layer** (system/workspace policy rules),
2. **Dynamic grant layer** (session or user-approved grants),
3. **Capability layer** (runtime-issued constrained authorizations).

Final decision = `ALLOW` only if no explicit deny applies and at least one allow path is valid under constraints.

## 4. Permission object schema

A permission rule MUST be serializable with the following shape:

```json
{
  "id": "perm-read-workspace",
  "effect": "allow",
  "action": "fs.read",
  "resource": "file:///workspace/Smo.OS/*",
  "constraints": {
    "not_before": "2026-01-01T10:00:00Z",
    "not_after": "2026-01-01T12:00:00Z",
    "max_calls": 1000,
    "max_bytes": 5000000
  },
  "source": "workspace-policy",
  "priority": 100,
  "created_at": "2026-01-01T09:59:00Z",
  "meta": {
    "owner": "security-team"
  }
}
```

### 4.1 Required fields

- `id` (string)
- `effect` (`allow` | `deny`)
- `action` (string)
- `resource` (string)
- `source` (string)
- `priority` (integer)
- `created_at` (RFC3339)

### 4.2 Optional fields

- `constraints` (object)
- `meta` (object)

## 5. Policy document schema

```json
{
  "policy_version": "0.1.0",
  "default_effect": "deny",
  "layers": {
    "system": [],
    "workspace": [],
    "session": []
  }
}
```

Layer semantics:

- `system`: organization/global controls (highest trust).
- `workspace`: repository/runtime scoped controls.
- `session`: temporary grants during a run.

## 6. Canonical action/resource grammar

### 6.1 Actions

Canonical actions SHOULD include:

- `fs.read`, `fs.write`, `fs.exec`
- `proc.spawn`
- `net.connect`
- `secret.read`
- `registry.query`
- `audit.append`

Custom action names MUST be namespaced.

### 6.2 Resources

- `file://<abs-path-or-prefix>`
- `net://<scheme>/<host>[:port]`
- `proc://<binary-name>`
- `secret://<namespace>/<name>`
- `runtime://<component>/<operation>`

Wildcard rules:

- `*` only suffix wildcard for prefix matching.
- full wildcard `*` forbidden in strict mode.

## 7. Evaluation algorithm (normative)

Given request `(action, resource, context)`:

1. validate request shape,
2. gather matching rules from all layers,
3. sort by precedence (layer then priority),
4. apply explicit denies first,
5. evaluate allows and their constraints,
6. combine with capability result,
7. fallback to `default_effect`.

A runtime MUST expose the final `reason_code` and matched `rule_id` (if any).

## 8. Precedence rules

From highest to lowest:

1. explicit deny in `system`,
2. explicit deny in `workspace`,
3. explicit deny in `session`,
4. explicit allow in `system`,
5. explicit allow in `workspace`,
6. explicit allow in `session`,
7. capability allow (if policy profile permits),
8. default effect.

If two rules have same layer and effect, higher `priority` wins; ties break deterministically by lexical `id`.

## 9. Constraint semantics

Recommended baseline constraints:

- `not_before` / `not_after`
- `max_calls`
- `max_bytes`
- `allowed_methods`
- `path_prefixes`

Constraint evaluation MUST fail closed.

Unknown constraints:

- strict profile: deny with `DENY_CONSTRAINT_UNKNOWN`.
- compat profile: ignore unknown constraints but emit warning audit marker.

## 10. Permission lifecycle

### 10.1 Grant

A grant MAY originate from policy bootstrap, control plane, or user approval.

Every temporary grant MUST carry explicit expiry (`not_after` or TTL).

### 10.2 Review

Implementations SHOULD support periodic review for stale or overly broad grants.

### 10.3 Revoke

Revocation MUST be asynchronous-capable and effective at next guard check.

### 10.4 Expire

Expired permissions MUST be treated as absent.

## 11. Reason code contract

Minimum reason-code set:

- `ALLOW_RULE_MATCH`
- `ALLOW_CAPABILITY`
- `DENY_DEFAULT`
- `DENY_EXPLICIT`
- `DENY_MODE_STRICT`
- `DENY_CONSTRAINT_TTL`
- `DENY_CONSTRAINT_RESOURCE`
- `DENY_CONSTRAINT_UNKNOWN`
- `DENY_CAPABILITY_NONE`
- `DENY_CAPABILITY_REVOKED`
- `DENY_CAPABILITY_EXPIRED`
- `DENY_CAPABILITY_CONSTRAINT`

## 12. Audit requirements

Every permission decision MUST emit an audit record:

```json
{
  "ts": "RFC3339",
  "run_id": "string",
  "actor_id": "string",
  "request": { "action": "string", "resource": "string" },
  "decision": "allow|deny",
  "reason_code": "string",
  "matched_rule_id": "string|null",
  "matched_layer": "system|workspace|session|null",
  "capability_instance_id": "string|null",
  "policy_version": "0.1.0",
  "event_hash": "sha256-...",
  "prev_event_hash": "sha256-...|null"
}
```

Audit records SHOULD be append-only and hash-chained per run.

## 13. Security invariants

Conformant implementations MUST ensure:

1. no side-effectful operation executes without an allow decision,
2. explicit denies always dominate allows,
3. revoked/expired grants are never honored,
4. strict mode rejects global wildcard resources,
5. policy-evaluator failure causes deny (fail closed).

## 14. Conformance profile (v0.1.0)

Minimum tests:

1. deny-by-default with empty policy,
2. explicit deny overriding explicit allow,
3. layer precedence correctness,
4. priority tie-break determinism,
5. expiry and revocation enforcement,
6. strict-mode wildcard rejection,
7. audit chain continuity.

## 15. Migration guidance

1. start with audit-only mode in compat profile,
2. inventory effective allows by action/resource,
3. introduce explicit denies for high-risk resources,
4. enforce expiry on all temporary grants,
5. switch default profile to strict.

## 16. Versioning

This document defines the initial permission-system contract at version `0.1.0`.
