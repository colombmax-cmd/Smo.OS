# Memory Access Layer Specification v0.1 (Phase 0)

## Status
- Version: `0.1`
- Scope: **Specification only** (no runtime behavior changes in this phase).

## Objective
Define the authorization contract between the Cognitive Orchestrator and Smo.OS/PLOS for memory access firewalling with:
- default deny,
- bounded scope,
- bounded duration,
- verifiable user-approved grants.

## Roles and Responsibility Split

### Cognitive Orchestrator (decision plane)
- Discovers available target scopes through a **structure-only** channel.
- Never reads memory payload data through that channel.
- Builds an `AccessGrant` proposal.
- Ensures user validation before submission to Smo.OS.

### Smo.OS / PLOS Memory Access Layer (enforcement plane)
- Applies grants exactly as received.
- Enforces scope + capability + expiration constraints.
- Uses default deny whenever validation fails or data is missing.
- Produces auditable access decisions.

## Core Security Principles
1. **Default deny**: no grant, invalid grant, expired grant, unknown capability, or out-of-scope request must be denied.
2. **Least privilege**: grants are limited to explicit capabilities and scopes.
3. **Time-bounded authorization**: all grants must have an expiration.
4. **Split visibility**: orchestrator structure access is metadata-only.

## Canonical Grant Contract

```ts
type AccessGrant = {
  grantId: string;

  // Identity scope (explicitly fixed in Phase 0 decisions)
  agentId: string;
  sessionId: string;

  // Authorization surface
  capabilities: string[];
  allowedScopes: string[];

  // Time window (clock source fixed in Phase 0 decisions)
  issuedAtMs: number;
  expiresAtMs: number;

  // User validation traceability
  userConsentRef: string;

  // Optional bounded constraints
  constraints?: {
    maxItems?: number;
    readOnly?: boolean;
  };
};
```

## Phase 0 Decisions (Validated)
- Grant identity binding uses **both `agentId` and `sessionId`**.
- Timestamp authority for temporal validation is **Smo.OS server time**.
- On expiration (`nowMs > expiresAtMs`), behavior is **hard deny**.

## Validation Rules (Normative)
For each memory access request, Smo.OS MUST evaluate:
1. grant exists and is well-formed;
2. request identity matches `agentId` + `sessionId`;
3. `capability` is included in grant capabilities;
4. requested scope is in `allowedScopes`;
5. current server time (`nowMs`) is within grant validity window.

If any rule fails, Smo.OS MUST deny access.

## Access Evaluation Output (minimum)
Smo.OS should produce an evaluation result with:
- decision: `allow | deny`,
- deniedReason (when deny),
- effectiveScopes (when allow),
- grantId,
- timestampMs.

## Structure-Only Discovery Contract
The orchestrator may request a view of available memory structure containing:
- scope identifiers,
- namespace/category metadata,
- optional schema hints.

This contract MUST NOT expose memory values/content.

## Out of Scope for Phase 0
- Grant signature format / cryptographic attestation.
- Storage backend for grants.
- Network transport endpoint design.
- Concrete TypeScript implementation.

These items are targeted in subsequent implementation phases.
