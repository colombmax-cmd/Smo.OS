import { verifyAuditChain } from "../src/runtime/audit_verify";
import { SandboxRuntime, SandboxPolicy, SandboxAuditEvent } from "../src/runtime/sandbox";

function assert(name: string, cond: boolean) {
  if (!cond) throw new Error(`FAIL: ${name}`);
  console.log(`OK: ${name}`);
}

const now = Date.now();
const policy: SandboxPolicy = {
  policyVersion: "0.1.0",
  defaultEffect: "deny",
  layers: {
    system: [{ id: "deny-secret", effect: "deny", action: "secret.read", resource: "secret://*", priority: 10 }],
    workspace: [{ id: "allow-net", effect: "allow", action: "net.connect", resource: "net://https/api.example.com", priority: 9 }],
    session: [],
  },
};

const audit: SandboxAuditEvent[] = [];
const rt = new SandboxRuntime(
  { runId: "run-1", actorId: "tester", policyVersion: "0.1.0", createdAt: new Date().toISOString(), expiresAt: new Date(now + 3600_000).toISOString(), mode: "strict" },
  policy,
  (e) => audit.push(e)
);

assert("explicit deny precedence", rt.evaluate({ action: "secret.read", resource: "secret://prod/token" }).reasonCode === "DENY_EXPLICIT");
assert("allow rule match", rt.evaluate({ action: "net.connect", resource: "net://https/api.example.com" }).reasonCode === "ALLOW_RULE_MATCH");
assert("strict wildcard reject", rt.evaluate({ action: "fs.read", resource: "*" }).reasonCode === "DENY_MODE_STRICT");

const capId = rt.issueCapability({ capabilityId: "cap-temp", action: "net.connect", resource: "net://https/cap.example.com", delegable: false, constraints: { maxCalls: 1 } });
assert("allow capability", rt.evaluate({ action: "net.connect", resource: "net://https/cap.example.com" }).reasonCode === "ALLOW_CAPABILITY");
rt.revokeCapability(capId);
assert("deny capability revoked", rt.evaluate({ action: "net.connect", resource: "net://https/cap.example.com" }).reasonCode === "DENY_CAPABILITY_REVOKED");

const verifyOk = verifyAuditChain(audit);
assert("audit chain continuity", verifyOk.ok);

const tampered = audit.map((e) => ({ ...e }));
tampered[0].reasonCode = "TAMPERED";
assert("tamper detection works", !verifyAuditChain(tampered).ok);

const sinkFailRt = new SandboxRuntime(
  { runId: "run-2", actorId: "tester", policyVersion: "0.1.0", createdAt: new Date().toISOString(), expiresAt: new Date(now + 3600_000).toISOString(), mode: "strict" },
  policy,
  () => {
    throw new Error("sink down");
  }
);
assert(
  "deny on audit sink failure",
  sinkFailRt.evaluate({ action: "net.connect", resource: "net://https/api.example.com" }).reasonCode === "AUDIT_SINK_FAILURE"
);

console.log("Sandbox conformance: OK ✅");
