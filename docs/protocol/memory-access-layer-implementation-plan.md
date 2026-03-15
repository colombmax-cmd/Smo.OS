# Memory Access Layer — Implementation Plan (post Phase 0)

## Scope
This document defines the ordered implementation roadmap after specification phase 0.


## Implementation Progress
- ✅ Phase 1 delivered in `src/agents/memory_access_manager.ts` (grant-aware authorization engine with identity, capability, scope and time checks).
- ✅ Phase 2 delivered in `src/agents/memory_access_manager.ts` (`getStructureView` metadata channel with no payload data exposure).
- ✅ Phase 3 delivered in `src/agents/memory_access_manager.ts` (audit sink + grant/access decision events).
- ✅ Phase 4 delivered in `src/agents/memory_access_manager.ts` (bounded auto-renewal + revalidation gating + explicit renewal outcomes).
- ✅ Phase 5 delivered in `src/agents/memory_access_manager.test.ts` (conformance/security checks for deny/allow/structure-only/renewal cases).
- ✅ Phase 6 delivered (`README.md` MAL summary + `docs/protocol/memory-access-layer-operations-guide-0.1.md` protocol examples and operational defaults).

## Phase 1 — Types and Authorization Engine (Core MAL)
**Goal:** move from static filtering to dynamic grant enforcement.

### Deliverables
- Runtime types for request/grant/evaluation.
- Enforcement checks for:
  - identity binding (`agentId` + `sessionId`),
  - capability and scope intersection,
  - temporal validity using Smo.OS clock,
  - default deny on any invalid condition.

## Phase 2 — Structure-Only Access Channel
**Goal:** provide orchestrator discovery without data payload access.

### Deliverables
- Metadata-only scope catalog endpoint or service API.
- Strong separation between:
  - orchestrator structure access,
  - agent data access via grant-enforced view.

## Phase 3 — Audit Trail and Decision Logging
**Goal:** make every access decision and grant lifecycle event traceable.

### Deliverables
- Events for grant issue/reject, access allow/deny, expiration deny.
- Minimum audit fields: actor, session, capability, requested scopes, effective scopes, decision reason, timestamp.

## Phase 4 — Bounded Grant Renewal Policy (NEW)
**Goal:** reduce friction while preserving strict security posture.

### Policy
- Auto-renewal is optional and disabled by default.
- If enabled, renewals are bounded to **1 or 2 maximum** (`maxAutoRenewals`).
- Renewal keeps the same privilege surface (no scope/capability escalation).
- Renewal still depends on valid grant state and Smo.OS clock checks.
- If renewal would exceed configured cumulative duration threshold, user re-validation is required.
- If re-validation is missing or denied, enforcement falls back to hard deny.

### Deliverables
- Renewal counters and policy fields in grant lifecycle model.
- Explicit decision outcomes:
  - `auto_renewed`,
  - `renewal_requires_user_validation`,
  - `renewal_denied_hard`.
- Audit records for each renewal decision.

## Phase 5 — Conformance and Security Tests
**Goal:** prove behavior in normal and edge conditions.

### Required cases
- deny without grant,
- deny on expiration (hard deny),
- partial allow on scope intersection,
- deny on identity mismatch,
- structure-only path does not leak data,
- bounded renewal limit enforcement,
- mandatory user re-validation when renewal threshold is exceeded.

## Phase 6 — Documentation and Operational Guide
**Goal:** make policy and operations clear for integrators.

### Deliverables
- README summary of MAL firewall model.
- Protocol examples for grant request, access evaluation, expiration, renewal, and re-validation prompt flow.
- Operational defaults and secure baseline recommendations.

## Ordering Rationale
The renewal phase is placed **after audit foundations** and **before tests** so that:
1. renewal decisions are observable from day one,
2. test coverage includes renewal behavior as first-class security logic.
