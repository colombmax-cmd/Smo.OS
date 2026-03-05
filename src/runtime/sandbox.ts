import * as crypto from "crypto";

export type SandboxMode = "strict" | "compat";
export type PolicyLayer = "system" | "workspace" | "session";

export type SandboxContext = {
  runId: string;
  actorId: string;
  policyVersion: string;
  createdAt: string;
  expiresAt: string;
  mode: SandboxMode;
};

export type SandboxRequest = {
  action: string;
  resource: string;
  now?: number;
  bytes?: number;
  method?: string;
};

export type RuleConstraints = {
  notAfterEpochMs?: number;
  notBeforeEpochMs?: number;
  maxCalls?: number;
  maxBytes?: number;
  allowedMethods?: string[];
  [k: string]: unknown;
};

export type SandboxRule = {
  id: string;
  effect: "allow" | "deny";
  action: string;
  resource: string;
  source?: string;
  priority?: number;
  constraints?: RuleConstraints;
};

export type SandboxPolicy = {
  policyVersion: string;
  defaultEffect: "deny" | "allow";
  rules?: SandboxRule[];
  layers?: Partial<Record<PolicyLayer, SandboxRule[]>>;
};

export type CapabilityConstraints = {
  notBefore?: string;
  notAfter?: string;
  maxCalls?: number;
  maxBytes?: number;
  allowedMethods?: string[];
};

export type SandboxCapability = {
  capabilityInstanceId: string;
  capabilityId: string;
  issuer: string;
  subject: string;
  action: string;
  resource: string;
  constraints?: CapabilityConstraints;
  delegable: boolean;
  parentCapabilityInstanceId?: string | null;
  issuedAt: string;
  revoked: boolean;
  meta?: Record<string, unknown>;
  callCount: number;
};

export type SandboxDecision = {
  decision: "allow" | "deny";
  reasonCode:
    | "DENY_DEFAULT"
    | "DENY_EXPLICIT"
    | "DENY_CONSTRAINT_TTL"
    | "DENY_CONSTRAINT_RESOURCE"
    | "DENY_CONSTRAINT_UNKNOWN"
    | "DENY_MODE_STRICT"
    | "ALLOW_RULE_MATCH"
    | "DENY_CAPABILITY_NONE"
    | "DENY_CAPABILITY_REVOKED"
    | "DENY_CAPABILITY_EXPIRED"
    | "DENY_CAPABILITY_NOT_BEFORE"
    | "DENY_CAPABILITY_CONSTRAINT"
    | "ALLOW_CAPABILITY"
    | "AUDIT_SINK_FAILURE"
    | "AUDIT_HASH_FAILURE";
  ruleId?: string;
  matchedLayer?: PolicyLayer;
  capabilityInstanceId?: string;
  compatExceptionUsed: boolean;
};

export type SandboxAuditEvent = {
  ts: string;
  runId: string;
  actorId: string;
  eventType: "permission.decision" | "capability.decision" | "sandbox.decision" | "audit.error";
  request: { action: string; resource: string };
  decision: "allow" | "deny" | "error";
  reasonCode: string;
  matchedRuleId: string | null;
  matchedLayer: PolicyLayer | null;
  policyVersion: string;
  capabilityInstanceId: string | null;
  compatExceptionUsed: boolean;
  diagnostic: { constraintFailures?: string[]; message?: string } | null;
  eventHash: string;
  prevEventHash: string | null;
};

export type IssueCapabilityInput = {
  capabilityId?: string;
  id?: string;
  issuer?: string;
  subject?: string;
  action: string;
  resource: string;
  constraints?: CapabilityConstraints;
  ttlS?: number;
  delegable: boolean;
  parentCapabilityInstanceId?: string | null;
  issuedAt?: string;
  issuedAtEpochMs?: number;
  meta?: Record<string, unknown>;
};

type LayeredRule = { layer: PolicyLayer; rule: SandboxRule };

function matchesPattern(pattern: string, value: string): boolean {
  if (pattern === value) return true;
  if (pattern === "*") return true;
  if (!pattern.endsWith("*")) return false;
  return value.startsWith(pattern.slice(0, -1));
}
function isGlobalWildcard(pattern: string): boolean { return pattern.trim() === "*"; }
function sha256(input: string): string { return `sha256-${crypto.createHash("sha256").update(input).digest("hex")}`; }
function toEpochMs(v?: string): number | null { if (!v) return null; const n = Date.parse(v); return Number.isFinite(n) ? n : null; }
function layerRank(layer: PolicyLayer): number { return layer === "system" ? 0 : layer === "workspace" ? 1 : 2; }

export class SandboxRuntime {
  private readonly capabilities = new Map<string, SandboxCapability>();
  private prevEventHash: string | null = null;

  constructor(private readonly context: SandboxContext, private readonly policy: SandboxPolicy, private readonly auditSink?: (event: SandboxAuditEvent) => void) {}

  issueCapability(input: IssueCapabilityInput): string {
    const capabilityInstanceId = `cap-${crypto.randomUUID()}`;
    const issuedAtIso = input.issuedAt ?? (input.issuedAtEpochMs ? new Date(input.issuedAtEpochMs).toISOString() : new Date().toISOString());
    const parsedIssued = toEpochMs(issuedAtIso) ?? Date.now();
    const constraints: CapabilityConstraints = { ...(input.constraints ?? {}) };
    if (!constraints.notAfter && typeof input.ttlS === "number") constraints.notAfter = new Date(parsedIssued + input.ttlS * 1000).toISOString();

    this.capabilities.set(capabilityInstanceId, {
      capabilityInstanceId,
      capabilityId: input.capabilityId ?? input.id ?? capabilityInstanceId,
      issuer: input.issuer ?? "runtime://local",
      subject: input.subject ?? this.context.actorId,
      action: input.action,
      resource: input.resource,
      constraints,
      delegable: input.delegable,
      parentCapabilityInstanceId: input.parentCapabilityInstanceId ?? null,
      issuedAt: issuedAtIso,
      revoked: false,
      meta: input.meta,
      callCount: 0,
    });
    return capabilityInstanceId;
  }

  delegateCapability(parentCapabilityInstanceId: string, input: Omit<IssueCapabilityInput, "parentCapabilityInstanceId">): string | null {
    const parent = this.capabilities.get(parentCapabilityInstanceId);
    if (!parent || parent.revoked || !parent.delegable) return null;
    if (!matchesPattern(parent.action, input.action) || !matchesPattern(parent.resource, input.resource)) return null;
    const parentNotAfter = toEpochMs(parent.constraints?.notAfter);
    const childNotAfter = toEpochMs(input.constraints?.notAfter);
    if (parentNotAfter !== null && childNotAfter !== null && childNotAfter > parentNotAfter) return null;
    return this.issueCapability({ ...input, parentCapabilityInstanceId });
  }

  revokeCapability(capabilityInstanceId: string): void {
    const cap = this.capabilities.get(capabilityInstanceId);
    if (cap) this.capabilities.set(capabilityInstanceId, { ...cap, revoked: true });
  }

  evaluate(req: SandboxRequest): SandboxDecision {
    const now = req.now ?? Date.now();
    if (this.context.mode === "strict" && isGlobalWildcard(req.resource)) {
      return this.emitDecision(req, { decision: "deny", reasonCode: "DENY_MODE_STRICT", compatExceptionUsed: false });
    }

    const rules = this.collectMatchingRules(req);

    for (const d of rules.filter((x) => x.rule.effect === "deny").sort((a, b) => this.compareRules(a, b))) {
      const check = this.checkRuleConstraints(d.rule, req, now);
      if (check.reasonCode === "DENY_CONSTRAINT_UNKNOWN") return this.emitDecision(req, { decision: "deny", reasonCode: "DENY_CONSTRAINT_UNKNOWN", ruleId: d.rule.id, matchedLayer: d.layer, compatExceptionUsed: false });
      if (check.ok) return this.emitDecision(req, { decision: "deny", reasonCode: "DENY_EXPLICIT", ruleId: d.rule.id, matchedLayer: d.layer, compatExceptionUsed: false });
    }

    for (const a of rules.filter((x) => x.rule.effect === "allow").sort((a, b) => this.compareRules(a, b))) {
      const check = this.checkRuleConstraints(a.rule, req, now);
      if (check.reasonCode === "DENY_CONSTRAINT_UNKNOWN") return this.emitDecision(req, { decision: "deny", reasonCode: "DENY_CONSTRAINT_UNKNOWN", ruleId: a.rule.id, matchedLayer: a.layer, compatExceptionUsed: false });
      if (check.ok) return this.emitDecision(req, { decision: "allow", reasonCode: "ALLOW_RULE_MATCH", ruleId: a.rule.id, matchedLayer: a.layer, compatExceptionUsed: false });
    }

    const capabilityDecision = this.evaluateCapability(req, now);
    if (capabilityDecision.reasonCode === "ALLOW_CAPABILITY") return capabilityDecision;

    if (this.policy.defaultEffect === "allow" && this.context.mode === "compat") {
      return this.emitDecision(req, { decision: "allow", reasonCode: "ALLOW_RULE_MATCH", compatExceptionUsed: true });
    }

    return this.emitDecision(req, {
      decision: "deny",
      reasonCode: capabilityDecision.reasonCode === "DENY_CAPABILITY_NONE" ? "DENY_DEFAULT" : capabilityDecision.reasonCode,
      capabilityInstanceId: capabilityDecision.capabilityInstanceId,
      compatExceptionUsed: false,
    });
  }

  private collectMatchingRules(req: SandboxRequest): LayeredRule[] {
    const fromLayers: LayeredRule[] = [];
    if (this.policy.layers) {
      for (const layer of ["system", "workspace", "session"] as PolicyLayer[]) {
        for (const rule of this.policy.layers[layer] ?? []) {
          if (matchesPattern(rule.action, req.action) && matchesPattern(rule.resource, req.resource)) fromLayers.push({ layer, rule });
        }
      }
    }
    if (fromLayers.length > 0) return fromLayers;
    return (this.policy.rules ?? [])
      .filter((rule) => matchesPattern(rule.action, req.action) && matchesPattern(rule.resource, req.resource))
      .map((rule) => ({ layer: "workspace", rule }));
  }

  private compareRules(a: LayeredRule, b: LayeredRule): number {
    const layerCmp = layerRank(a.layer) - layerRank(b.layer);
    if (layerCmp !== 0) return layerCmp;
    const pa = a.rule.priority ?? 0;
    const pb = b.rule.priority ?? 0;
    if (pb !== pa) return pb - pa;
    return a.rule.id.localeCompare(b.rule.id);
  }

  private checkRuleConstraints(rule: SandboxRule, req: SandboxRequest, now: number): { ok: boolean; reasonCode?: SandboxDecision["reasonCode"] } {
    const c = rule.constraints;
    if (!c) return { ok: true };
    const known = new Set(["notAfterEpochMs", "notBeforeEpochMs", "maxCalls", "maxBytes", "allowedMethods"]);
    const unknown = Object.keys(c).find((k) => !known.has(k));
    if (unknown && this.context.mode === "strict") return { ok: false, reasonCode: "DENY_CONSTRAINT_UNKNOWN" };
    if (typeof c.notBeforeEpochMs === "number" && now < c.notBeforeEpochMs) return { ok: false, reasonCode: "DENY_CONSTRAINT_TTL" };
    if (typeof c.notAfterEpochMs === "number" && now > c.notAfterEpochMs) return { ok: false, reasonCode: "DENY_CONSTRAINT_TTL" };
    if (typeof c.maxBytes === "number" && typeof req.bytes === "number" && req.bytes > c.maxBytes) return { ok: false, reasonCode: "DENY_CONSTRAINT_RESOURCE" };
    if (Array.isArray(c.allowedMethods) && typeof req.method === "string" && !c.allowedMethods.includes(req.method)) return { ok: false, reasonCode: "DENY_CONSTRAINT_RESOURCE" };
    return { ok: true };
  }

  private evaluateCapability(req: SandboxRequest, now: number): SandboxDecision {
    const candidates = [...this.capabilities.values()].filter((cap) => matchesPattern(cap.action, req.action) && matchesPattern(cap.resource, req.resource));
    if (candidates.length === 0) return this.emitDecision(req, { decision: "deny", reasonCode: "DENY_CAPABILITY_NONE", compatExceptionUsed: false });

    const revoked = candidates.find((cap) => cap.revoked);
    if (revoked) return this.emitDecision(req, { decision: "deny", reasonCode: "DENY_CAPABILITY_REVOKED", capabilityInstanceId: revoked.capabilityInstanceId, compatExceptionUsed: false });

    for (const cap of candidates) {
      const notBefore = toEpochMs(cap.constraints?.notBefore);
      if (notBefore !== null && now < notBefore) return this.emitDecision(req, { decision: "deny", reasonCode: "DENY_CAPABILITY_NOT_BEFORE", capabilityInstanceId: cap.capabilityInstanceId, compatExceptionUsed: false });
      const notAfter = toEpochMs(cap.constraints?.notAfter);
      if (notAfter !== null && now > notAfter) return this.emitDecision(req, { decision: "deny", reasonCode: "DENY_CAPABILITY_EXPIRED", capabilityInstanceId: cap.capabilityInstanceId, compatExceptionUsed: false });
      if (typeof cap.constraints?.maxCalls === "number" && cap.callCount >= cap.constraints.maxCalls) return this.emitDecision(req, { decision: "deny", reasonCode: "DENY_CAPABILITY_CONSTRAINT", capabilityInstanceId: cap.capabilityInstanceId, compatExceptionUsed: false });
      if (typeof cap.constraints?.maxBytes === "number" && typeof req.bytes === "number" && req.bytes > cap.constraints.maxBytes) return this.emitDecision(req, { decision: "deny", reasonCode: "DENY_CAPABILITY_CONSTRAINT", capabilityInstanceId: cap.capabilityInstanceId, compatExceptionUsed: false });
      if (Array.isArray(cap.constraints?.allowedMethods) && typeof req.method === "string" && !cap.constraints.allowedMethods.includes(req.method)) return this.emitDecision(req, { decision: "deny", reasonCode: "DENY_CAPABILITY_CONSTRAINT", capabilityInstanceId: cap.capabilityInstanceId, compatExceptionUsed: false });
      this.capabilities.set(cap.capabilityInstanceId, { ...cap, callCount: cap.callCount + 1 });
      return this.emitDecision(req, { decision: "allow", reasonCode: "ALLOW_CAPABILITY", capabilityInstanceId: cap.capabilityInstanceId, compatExceptionUsed: false });
    }

    return this.emitDecision(req, { decision: "deny", reasonCode: "DENY_CAPABILITY_NONE", compatExceptionUsed: false });
  }

  private emitDecision(req: SandboxRequest, d: SandboxDecision): SandboxDecision {
    const eventType: SandboxAuditEvent["eventType"] = d.reasonCode.startsWith("DENY_CAPABILITY") || d.reasonCode === "ALLOW_CAPABILITY" ? "capability.decision" : "permission.decision";
    const base: Omit<SandboxAuditEvent, "eventHash"> = {
      ts: new Date().toISOString(),
      runId: this.context.runId,
      actorId: this.context.actorId,
      eventType,
      request: { action: req.action, resource: req.resource },
      decision: d.decision,
      reasonCode: d.reasonCode,
      matchedRuleId: d.ruleId ?? null,
      matchedLayer: d.matchedLayer ?? null,
      policyVersion: this.context.policyVersion,
      capabilityInstanceId: d.capabilityInstanceId ?? null,
      compatExceptionUsed: d.compatExceptionUsed,
      diagnostic: null,
      prevEventHash: this.prevEventHash,
    };

    let eventHash: string;
    try {
      eventHash = sha256(JSON.stringify(base));
    } catch {
      return { decision: "deny", reasonCode: "AUDIT_HASH_FAILURE", compatExceptionUsed: false };
    }

    const event: SandboxAuditEvent = { ...base, eventHash };
    this.prevEventHash = eventHash;

    if (this.auditSink) {
      try {
        this.auditSink(event);
      } catch (e) {
        const failBase: Omit<SandboxAuditEvent, "eventHash"> = {
          ts: new Date().toISOString(),
          runId: this.context.runId,
          actorId: this.context.actorId,
          eventType: "audit.error",
          request: { action: req.action, resource: req.resource },
          decision: "error",
          reasonCode: "AUDIT_SINK_FAILURE",
          matchedRuleId: null,
          matchedLayer: null,
          policyVersion: this.context.policyVersion,
          capabilityInstanceId: null,
          compatExceptionUsed: false,
          diagnostic: { message: (e as Error)?.message || "audit sink failed" },
          prevEventHash: this.prevEventHash,
        };
        const failEvent: SandboxAuditEvent = { ...failBase, eventHash: sha256(JSON.stringify(failBase)) };
        this.prevEventHash = failEvent.eventHash;
        if (d.decision === "allow") {
          return { decision: "deny", reasonCode: "AUDIT_SINK_FAILURE", compatExceptionUsed: false };
        }
      }
    }

    return d;
  }
}

export const DEFAULT_SANDBOX_POLICY: SandboxPolicy = { policyVersion: "0.1.0", defaultEffect: "deny", rules: [] };
