# Agent Runtime Audit Trail Specification v0.1.0 (Draft)

Status: draft  
Target: Agent Runtime Safety pillar

## 1. Purpose

This specification defines the minimum audit trail contract for agent runtime safety in Smo.OS.

It standardizes:

- audit event schema,
- append-only integrity guarantees,
- hash-chain semantics,
- decision explainability fields,
- retention/export expectations,
- conformance requirements.

## 2. Design goals

1. **Tamper-evidence**: modifications to historical audit events MUST be detectable.
2. **Determinism support**: audit data MUST be sufficient to reproduce why a decision was made.
3. **Low-friction ingestion**: event shape MUST be line-oriented and machine-readable.
4. **Privacy minimization**: logs must avoid unnecessary sensitive payloads.
5. **Interoperability**: format SHOULD be transport-safe and portable across runtimes.

## 3. Audit scope

A runtime MUST emit audit records for at least:

- permission evaluations,
- capability evaluations,
- sandbox allow/deny decisions,
- policy load/reload/revocation actions,
- enforcement errors and fail-closed decisions.

Implementations MAY emit additional operational events if they do not break append-only and integrity guarantees.

## 4. Event model

Each audit record is a JSON object (one line per event in JSONL mode).

```json
{
  "ts": "2026-01-01T10:00:00Z",
  "run_id": "run-123",
  "actor_id": "agent://planner",
  "event_type": "permission.decision",
  "request": {
    "action": "fs.read",
    "resource": "file:///workspace/Smo.OS/*"
  },
  "decision": "allow",
  "reason_code": "ALLOW_RULE_MATCH",
  "matched_rule_id": "allow-workspace-read",
  "matched_layer": "workspace",
  "capability_instance_id": null,
  "policy_version": "0.1.0",
  "compat_exception_used": false,
  "diagnostic": {
    "constraint_failures": []
  },
  "prev_event_hash": "sha256-...",
  "event_hash": "sha256-..."
}
```

### 4.1 Required fields

- `ts` (RFC3339)
- `run_id` (string)
- `actor_id` (string)
- `event_type` (string)
- `decision` (`allow` | `deny` | `info` | `error`)
- `reason_code` (string)
- `policy_version` (string)
- `prev_event_hash` (string|null)
- `event_hash` (string)

### 4.2 Conditionally required fields

- `request.action` and `request.resource` for decision events.
- `matched_rule_id` when a policy rule was used.
- `capability_instance_id` when capability path was used.

### 4.3 Optional fields

- `matched_layer` (`system|workspace|session|null`)
- `diagnostic` (object, non-sensitive)
- implementation metadata (namespaced keys)

## 5. Integrity model (hash chaining)

Per `run_id`, events MUST form a contiguous hash chain:

- `prev_event_hash` of event `n` = `event_hash` of event `n-1`,
- first event of a run MUST have `prev_event_hash = null`.

`event_hash` MUST be computed over a canonical serialization of the event payload excluding `event_hash` itself.

Implementations SHOULD use SHA-256 and prefix with `sha256-`.

## 6. Append-only requirements

1. Audit storage MUST be append-only during runtime execution.
2. In-place mutation of historical entries is forbidden.
3. Deletion/rotation MAY occur only through explicit retention policy and MUST preserve chain-verification artifacts.

## 7. Redaction and privacy

Audit records MUST NOT include:

- raw secret values,
- private key material,
- full sensitive payload bodies when summaries are sufficient.

When needed, implementations SHOULD include a deterministic digest or bounded metadata instead of raw content.

## 8. Error handling

On audit sink failure:

- runtime MUST fail closed for guarded actions,
- runtime MUST emit best-effort fallback error event,
- reason code SHOULD include `AUDIT_SINK_FAILURE`.

On hash-computation failure:

- action MUST be denied,
- runtime SHOULD emit `AUDIT_HASH_FAILURE` diagnostic path.

## 9. Reason-code baseline

Minimum audit-related reason codes:

- `ALLOW_RULE_MATCH`
- `ALLOW_CAPABILITY`
- `DENY_DEFAULT`
- `DENY_EXPLICIT`
- `DENY_CONSTRAINT_TTL`
- `DENY_CONSTRAINT_UNKNOWN`
- `DENY_CAPABILITY_EXPIRED`
- `DENY_CAPABILITY_REVOKED`
- `AUDIT_SINK_FAILURE`
- `AUDIT_HASH_FAILURE`

## 10. Export and verification

Implementations SHOULD provide:

1. **Export** to JSONL bundle (with run partitioning metadata),
2. **Verify** command to check:
   - chain continuity,
   - hash integrity,
   - monotonic timestamp sanity per run,
3. summary stats (`events_total`, `denies_total`, `chain_breaks`).

## 11. Retention model

Retention policy SHOULD define:

- minimum retention duration,
- archival target format,
- deletion workflow with authorization,
- post-deletion retained integrity metadata (e.g., segment roots).

Retention must not silently break the ability to verify preserved audit segments.

## 12. Conformance profile (v0.1.0)

A minimal conformance suite SHOULD include:

1. append-only write behavior,
2. valid first-event null predecessor,
3. chain continuity for N>1 events,
4. tamper detection on modified historical event,
5. deny-on-audit-sink-failure behavior,
6. forbidden secret-field leakage checks.

## 13. Interoperability notes

To maximize interoperability:

- preserve unknown namespaced fields,
- keep timestamps in RFC3339 UTC,
- keep reason codes stable across patch versions,
- avoid runtime-specific binary encodings in baseline profile.

## 14. Migration guidance

For deployments without structured audit:

1. start emitting decision-only events,
2. add hash chaining per run,
3. enforce fail-closed on audit sink failure,
4. add export/verify tooling,
5. integrate retention and rotation policy.

## 15. Versioning

This document defines the initial audit-trail contract at version `0.1.0`.
