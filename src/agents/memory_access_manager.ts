export type GrantConstraint = {
  maxItems?: number;
  readOnly?: boolean;
};

export type GrantRenewalState = {
  autoRenewalCount: number;
  userRevalidatedAtMs?: number;
};

export type AccessGrant = {
  grantId: string;
  agentId: string;
  sessionId: string;
  capabilities: string[];
  allowedScopes: string[];
  issuedAtMs: number;
  expiresAtMs: number;
  userConsentRef: string;
  constraints?: GrantConstraint;
  renewal?: GrantRenewalState;
};

export type GrantRenewalPolicy = {
  enabled: boolean;
  maxAutoRenewals: number;
  renewalDurationMs: number;
  requiresUserRevalidationAfterMs: number;
};

export type RenewalDecision =
  | "none"
  | "auto_renewed"
  | "renewal_requires_user_validation"
  | "renewal_denied_hard";

export type MemoryViewRequest = {
  userId: string;
  agentId: string;
  sessionId: string;
  capability: string;
  scope: string[];
  reason: string;
};

export type MemoryAccessDecision = "allow" | "deny";

export type DeniedReason =
  | "missing_grant"
  | "malformed_grant"
  | "identity_mismatch"
  | "grant_not_active"
  | "grant_expired"
  | "capability_not_granted"
  | "no_scope_authorized";

export type MemoryView = {
  request: MemoryViewRequest;
  decision: MemoryAccessDecision;
  deniedReason?: DeniedReason;
  renewalDecision?: RenewalDecision;
  grantId?: string;
  effectiveScopes: string[];
  deniedScopes: string[];
  context: Record<string, unknown>;
  timestampMs: number;
};

export type ScopeStructure = {
  scope: string;
  namespace?: string;
  category?: string;
  schemaHint?: string;
};

export type StructureViewRequest = {
  requesterId: string;
  reason: string;
  scope?: string[];
};

export type StructureView = {
  request: StructureViewRequest;
  scopes: ScopeStructure[];
  timestampMs: number;
};

export type GrantReviewReason = "accepted" | "invalid_shape" | "invalid_time_window";

export type MemoryAuditEventType =
  | "grant_issued"
  | "grant_rejected"
  | "memory_view_requested"
  | "memory_view_granted"
  | "memory_view_denied"
  | "grant_expired"
  | "structure_view_requested"
  | "auto_renewed"
  | "renewal_requires_user_validation"
  | "renewal_denied_hard";

export type MemoryAuditEvent = {
  type: MemoryAuditEventType;
  timestampMs: number;
  grantId?: string;
  actorId: string;
  sessionId?: string;
  capability?: string;
  requestedScopes?: string[];
  effectiveScopes?: string[];
  deniedScopes?: string[];
  reason?: string;
};

export interface MemoryAuditSink {
  record(event: MemoryAuditEvent): void;
}

export interface MemoryAccessLayer {
  reviewGrant(grant: AccessGrant): GrantReviewReason;
  getAuthorizedView(request: MemoryViewRequest, grant?: AccessGrant): MemoryView;
  getStructureView(request: StructureViewRequest): StructureView;
}

export class BoundedMemoryAccessLayer implements MemoryAccessLayer {
  constructor(
    private readonly memoryByScope: Record<string, Record<string, unknown>>,
    private readonly structureByScope: Record<string, Omit<ScopeStructure, "scope">> = {},
    private readonly nowMs: () => number = () => Date.now(),
    private readonly auditSink?: MemoryAuditSink,
    private readonly renewalPolicy: GrantRenewalPolicy = {
      enabled: false,
      maxAutoRenewals: 0,
      renewalDurationMs: 0,
      requiresUserRevalidationAfterMs: 0,
    },
  ) {}

  reviewGrant(grant: AccessGrant): GrantReviewReason {
    const now = this.nowMs();

    if (!this.isWellFormedGrant(grant)) {
      this.audit({
        type: "grant_rejected",
        timestampMs: now,
        grantId: grant.grantId,
        actorId: grant.agentId,
        sessionId: grant.sessionId,
        reason: "invalid_shape",
      });
      return "invalid_shape";
    }

    if (grant.expiresAtMs <= now || grant.issuedAtMs > now) {
      this.audit({
        type: "grant_rejected",
        timestampMs: now,
        grantId: grant.grantId,
        actorId: grant.agentId,
        sessionId: grant.sessionId,
        reason: "invalid_time_window",
      });
      return "invalid_time_window";
    }

    this.audit({
      type: "grant_issued",
      timestampMs: now,
      grantId: grant.grantId,
      actorId: grant.agentId,
      sessionId: grant.sessionId,
      requestedScopes: [...grant.allowedScopes],
      reason: grant.userConsentRef,
    });
    return "accepted";
  }

  getAuthorizedView(request: MemoryViewRequest, grant?: AccessGrant): MemoryView {
    const requestTs = this.nowMs();
    this.audit({
      type: "memory_view_requested",
      timestampMs: requestTs,
      grantId: grant?.grantId,
      actorId: request.agentId,
      sessionId: request.sessionId,
      capability: request.capability,
      requestedScopes: [...request.scope],
      reason: request.reason,
    });

    if (!grant) {
      return this.deny(request, "missing_grant", undefined, requestTs);
    }

    if (!this.isWellFormedGrant(grant)) {
      return this.deny(request, "malformed_grant", grant.grantId, requestTs);
    }

    if (grant.agentId !== request.agentId || grant.sessionId !== request.sessionId) {
      return this.deny(request, "identity_mismatch", grant.grantId, requestTs);
    }

    if (requestTs < grant.issuedAtMs) {
      return this.deny(request, "grant_not_active", grant.grantId, requestTs);
    }

    let activeGrant = grant;
    let renewalDecision: RenewalDecision = "none";

    if (requestTs > grant.expiresAtMs) {
      this.audit({
        type: "grant_expired",
        timestampMs: requestTs,
        grantId: grant.grantId,
        actorId: request.agentId,
        sessionId: request.sessionId,
        reason: "hard_deny_on_expiration",
      });

      const renewalOutcome = this.maybeAutoRenewGrant(grant, requestTs, request.agentId, request.sessionId);
      renewalDecision = renewalOutcome.renewalDecision;

      if (!renewalOutcome.grant) {
        return this.deny(request, "grant_expired", grant.grantId, requestTs, renewalDecision);
      }

      activeGrant = renewalOutcome.grant;
    }

    if (!activeGrant.capabilities.includes(request.capability)) {
      return this.deny(request, "capability_not_granted", activeGrant.grantId, requestTs, renewalDecision);
    }

    const effectiveScopes = request.scope.filter((scope) => activeGrant.allowedScopes.includes(scope));
    if (effectiveScopes.length === 0) {
      return this.deny(request, "no_scope_authorized", activeGrant.grantId, requestTs, renewalDecision);
    }

    const deniedScopes = request.scope.filter((scope) => !effectiveScopes.includes(scope));
    const context: Record<string, unknown> = {};
    for (const scope of effectiveScopes) {
      context[scope] = this.memoryByScope[scope] ?? {};
    }

    this.audit({
      type: "memory_view_granted",
      timestampMs: requestTs,
      grantId: activeGrant.grantId,
      actorId: request.agentId,
      sessionId: request.sessionId,
      capability: request.capability,
      requestedScopes: [...request.scope],
      effectiveScopes,
      deniedScopes,
      reason: request.reason,
    });

    return {
      request,
      decision: "allow",
      renewalDecision,
      grantId: activeGrant.grantId,
      effectiveScopes,
      deniedScopes,
      context,
      timestampMs: requestTs,
    };
  }

  getStructureView(request: StructureViewRequest): StructureView {
    const catalogScopes = new Set<string>([
      ...Object.keys(this.memoryByScope),
      ...Object.keys(this.structureByScope),
    ]);

    const selectedScopes = request.scope
      ? request.scope.filter((scope) => catalogScopes.has(scope))
      : Array.from(catalogScopes).sort();

    const scopes: ScopeStructure[] = selectedScopes.map((scope) => ({
      scope,
      ...this.structureByScope[scope],
    }));

    const timestampMs = this.nowMs();
    this.audit({
      type: "structure_view_requested",
      timestampMs,
      actorId: request.requesterId,
      requestedScopes: request.scope ? [...request.scope] : undefined,
      effectiveScopes: scopes.map((entry) => entry.scope),
      reason: request.reason,
    });

    return {
      request,
      scopes,
      timestampMs,
    };
  }

  private maybeAutoRenewGrant(
    grant: AccessGrant,
    nowMs: number,
    actorId: string,
    sessionId: string,
  ): { grant?: AccessGrant; renewalDecision: RenewalDecision } {
    if (!this.renewalPolicy.enabled || this.renewalPolicy.maxAutoRenewals <= 0 || this.renewalPolicy.renewalDurationMs <= 0) {
      this.audit({
        type: "renewal_denied_hard",
        timestampMs: nowMs,
        grantId: grant.grantId,
        actorId,
        sessionId,
        reason: "renewal_disabled_or_invalid_policy",
      });
      return { renewalDecision: "renewal_denied_hard" };
    }

    const currentCount = grant.renewal?.autoRenewalCount ?? 0;
    if (currentCount >= this.renewalPolicy.maxAutoRenewals) {
      this.audit({
        type: "renewal_denied_hard",
        timestampMs: nowMs,
        grantId: grant.grantId,
        actorId,
        sessionId,
        reason: "max_auto_renewals_reached",
      });
      return { renewalDecision: "renewal_denied_hard" };
    }

    const renewedExpiresAtMs = nowMs + this.renewalPolicy.renewalDurationMs;
    const cumulativeDurationMs = renewedExpiresAtMs - grant.issuedAtMs;
    const revalidationRequired =
      this.renewalPolicy.requiresUserRevalidationAfterMs > 0 &&
      cumulativeDurationMs > this.renewalPolicy.requiresUserRevalidationAfterMs;

    if (revalidationRequired && !grant.renewal?.userRevalidatedAtMs) {
      this.audit({
        type: "renewal_requires_user_validation",
        timestampMs: nowMs,
        grantId: grant.grantId,
        actorId,
        sessionId,
        reason: "cumulative_duration_threshold_exceeded",
      });
      return { renewalDecision: "renewal_requires_user_validation" };
    }

    const renewedGrant: AccessGrant = {
      ...grant,
      expiresAtMs: renewedExpiresAtMs,
      renewal: {
        autoRenewalCount: currentCount + 1,
        userRevalidatedAtMs: grant.renewal?.userRevalidatedAtMs,
      },
    };

    this.audit({
      type: "auto_renewed",
      timestampMs: nowMs,
      grantId: grant.grantId,
      actorId,
      sessionId,
      reason: `auto_renewal_${currentCount + 1}`,
    });

    return {
      grant: renewedGrant,
      renewalDecision: "auto_renewed",
    };
  }

  private deny(
    request: MemoryViewRequest,
    deniedReason: DeniedReason,
    grantId?: string,
    timestampMs: number = this.nowMs(),
    renewalDecision: RenewalDecision = "none",
  ): MemoryView {
    const deniedView: MemoryView = {
      request,
      decision: "deny",
      deniedReason,
      renewalDecision,
      grantId,
      effectiveScopes: [],
      deniedScopes: [...request.scope],
      context: {},
      timestampMs,
    };

    this.audit({
      type: "memory_view_denied",
      timestampMs,
      grantId,
      actorId: request.agentId,
      sessionId: request.sessionId,
      capability: request.capability,
      requestedScopes: [...request.scope],
      effectiveScopes: [],
      deniedScopes: [...request.scope],
      reason: renewalDecision === "none" ? deniedReason : `${deniedReason}:${renewalDecision}`,
    });

    return deniedView;
  }

  private audit(event: MemoryAuditEvent): void {
    this.auditSink?.record(event);
  }

  private isWellFormedGrant(grant: AccessGrant): boolean {
    return (
      grant.grantId.trim().length > 0 &&
      grant.agentId.trim().length > 0 &&
      grant.sessionId.trim().length > 0 &&
      grant.userConsentRef.trim().length > 0 &&
      Array.isArray(grant.capabilities) &&
      Array.isArray(grant.allowedScopes) &&
      Number.isFinite(grant.issuedAtMs) &&
      Number.isFinite(grant.expiresAtMs) &&
      grant.expiresAtMs >= grant.issuedAtMs
    );
  }
}
