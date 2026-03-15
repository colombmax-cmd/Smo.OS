import assert from "node:assert/strict";
import {
  AccessGrant,
  BoundedMemoryAccessLayer,
  MemoryAuditEvent,
  MemoryAuditSink,
  MemoryViewRequest,
} from "./memory_access_manager";

class InMemoryAuditSink implements MemoryAuditSink {
  public readonly events: MemoryAuditEvent[] = [];

  record(event: MemoryAuditEvent): void {
    this.events.push(event);
  }
}

function buildRequest(overrides: Partial<MemoryViewRequest> = {}): MemoryViewRequest {
  return {
    userId: "u-1",
    agentId: "agent-a",
    sessionId: "sess-1",
    capability: "memory.read",
    scope: ["profile", "tasks"],
    reason: "test",
    ...overrides,
  };
}

function buildGrant(overrides: Partial<AccessGrant> = {}): AccessGrant {
  return {
    grantId: "g-1",
    agentId: "agent-a",
    sessionId: "sess-1",
    capabilities: ["memory.read"],
    allowedScopes: ["profile"],
    issuedAtMs: 1000,
    expiresAtMs: 2000,
    userConsentRef: "consent-1",
    ...overrides,
  };
}

function run(): void {
  let now = 1500;

  const memory = {
    profile: { name: "Ada" },
    tasks: { count: 2 },
  };

  // 1) deny without grant
  {
    const sink = new InMemoryAuditSink();
    const mal = new BoundedMemoryAccessLayer(memory, {}, () => now, sink);
    const view = mal.getAuthorizedView(buildRequest());
    assert.equal(view.decision, "deny");
    assert.equal(view.deniedReason, "missing_grant");
  }

  // 2) deny on expiration (hard deny) when renewal disabled
  {
    now = 2500;
    const sink = new InMemoryAuditSink();
    const mal = new BoundedMemoryAccessLayer(memory, {}, () => now, sink);
    const view = mal.getAuthorizedView(buildRequest(), buildGrant());
    assert.equal(view.decision, "deny");
    assert.equal(view.deniedReason, "grant_expired");
    assert.equal(view.renewalDecision, "renewal_denied_hard");
  }

  // 3) partial allow on scope intersection
  {
    now = 1500;
    const sink = new InMemoryAuditSink();
    const mal = new BoundedMemoryAccessLayer(memory, {}, () => now, sink);
    const view = mal.getAuthorizedView(buildRequest(), buildGrant());
    assert.equal(view.decision, "allow");
    assert.deepEqual(view.effectiveScopes, ["profile"]);
    assert.deepEqual(view.deniedScopes, ["tasks"]);
    assert.deepEqual(view.context, { profile: { name: "Ada" } });
  }

  // 4) deny on identity mismatch
  {
    now = 1500;
    const sink = new InMemoryAuditSink();
    const mal = new BoundedMemoryAccessLayer(memory, {}, () => now, sink);
    const view = mal.getAuthorizedView(buildRequest({ sessionId: "sess-x" }), buildGrant());
    assert.equal(view.decision, "deny");
    assert.equal(view.deniedReason, "identity_mismatch");
  }

  // 5) structure-only path does not leak payload data
  {
    now = 1500;
    const mal = new BoundedMemoryAccessLayer(
      memory,
      {
        profile: { namespace: "plos.profile", schemaHint: "user_profile_v1" },
        tasks: { namespace: "plos.tasks", category: "todo" },
      },
      () => now,
    );

    const structure = mal.getStructureView({ requesterId: "orch-1", reason: "discover" });
    const serialized = JSON.stringify(structure);
    assert.equal(serialized.includes("Ada"), false);
    assert.equal(serialized.includes("count"), false);
    assert.equal(structure.scopes.length, 2);
  }

  // 6) bounded renewal limit enforcement
  {
    now = 2500;
    const mal = new BoundedMemoryAccessLayer(
      memory,
      {},
      () => now,
      undefined,
      {
        enabled: true,
        maxAutoRenewals: 1,
        renewalDurationMs: 300,
        requiresUserRevalidationAfterMs: 5000,
      },
    );

    const expiredGrantAtLimit = buildGrant({ renewal: { autoRenewalCount: 1 } });
    const view = mal.getAuthorizedView(buildRequest(), expiredGrantAtLimit);
    assert.equal(view.decision, "deny");
    assert.equal(view.renewalDecision, "renewal_denied_hard");
  }

  // 7) mandatory user re-validation when threshold exceeded
  {
    now = 2500;
    const mal = new BoundedMemoryAccessLayer(
      memory,
      {},
      () => now,
      undefined,
      {
        enabled: true,
        maxAutoRenewals: 2,
        renewalDurationMs: 700,
        requiresUserRevalidationAfterMs: 2000,
      },
    );

    const view = mal.getAuthorizedView(buildRequest(), buildGrant());
    assert.equal(view.decision, "deny");
    assert.equal(view.deniedReason, "grant_expired");
    assert.equal(view.renewalDecision, "renewal_requires_user_validation");
  }

  console.log("memory_access_manager phase-5 checks passed");
}

run();
