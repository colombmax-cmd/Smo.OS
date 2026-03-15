# Memory Access Layer Operations Guide v0.1

This guide complements:
- `docs/protocol/memory-access-layer-spec-0.1.md`
- `src/agents/memory_access_manager.ts`

It provides implementation-facing examples and secure operational defaults.

## 1) Grant request (Orchestrator -> Smo.OS)

```json
{
  "grantId": "grant-2026-03-15-001",
  "agentId": "agent.summary",
  "sessionId": "sess-8d9f",
  "capabilities": ["memory.read"],
  "allowedScopes": ["profile", "work.items"],
  "issuedAtMs": 1760000000000,
  "expiresAtMs": 1760000300000,
  "userConsentRef": "consent:ui:prompt:42",
  "constraints": {
    "readOnly": true,
    "maxItems": 50
  },
  "renewal": {
    "autoRenewalCount": 0
  }
}
```

## 2) Data access evaluation (Agent -> MAL)

Request (example):
```json
{
  "userId": "u-123",
  "agentId": "agent.summary",
  "sessionId": "sess-8d9f",
  "capability": "memory.read",
  "scope": ["profile", "work.items", "private.notes"],
  "reason": "summarize_work_context"
}
```

Allow output (partial scope):
```json
{
  "decision": "allow",
  "renewalDecision": "none",
  "grantId": "grant-2026-03-15-001",
  "effectiveScopes": ["profile", "work.items"],
  "deniedScopes": ["private.notes"],
  "timestampMs": 1760000010000
}
```

Deny output (expired + no renewal):
```json
{
  "decision": "deny",
  "deniedReason": "grant_expired",
  "renewalDecision": "renewal_denied_hard",
  "grantId": "grant-2026-03-15-001",
  "effectiveScopes": [],
  "deniedScopes": ["profile", "work.items", "private.notes"],
  "timestampMs": 1760000400000
}
```

## 3) Structure-only discovery (Orchestrator)

Request:
```json
{
  "requesterId": "orchestrator.main",
  "reason": "scope_discovery"
}
```

Response (metadata only, no payload values):
```json
{
  "scopes": [
    { "scope": "profile", "namespace": "plos.profile", "schemaHint": "user_profile_v1" },
    { "scope": "work.items", "namespace": "plos.work", "category": "task" }
  ],
  "timestampMs": 1760000005000
}
```

## 4) Renewal flow examples

### 4.1 Auto-renew succeeds
- Conditions: renewal enabled, below `maxAutoRenewals`, threshold for revalidation not exceeded.
- Result: `renewalDecision = "auto_renewed"`, access may proceed.

### 4.2 User re-validation required
- Condition: cumulative duration exceeds `requiresUserRevalidationAfterMs` and no `userRevalidatedAtMs` provided.
- Result: `renewalDecision = "renewal_requires_user_validation"` and access denied until consent refresh.

### 4.3 Hard deny
- Conditions: renewal disabled, invalid policy, or max renewals reached.
- Result: `renewalDecision = "renewal_denied_hard"` and strict deny.

## 5) Recommended secure defaults

- `default deny`: enabled everywhere (no grant => deny).
- `maxAutoRenewals`: `1` (or `2` maximum for higher-friction workflows).
- `renewalDurationMs`: short windows (e.g. 5-15 minutes).
- `requiresUserRevalidationAfterMs`: 20-30 minutes cumulative max.
- keep scope lists narrow (`allowedScopes` minimal and explicit).
- keep capabilities narrow (e.g., separate read/write capabilities).
- always attach a durable `userConsentRef`.
- always emit and persist audit events for grant review, access request, allow/deny, and renewal outcomes.
