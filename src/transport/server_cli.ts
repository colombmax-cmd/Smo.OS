#!/usr/bin/env node
import * as http from "http";
import * as fs from "fs";
import * as path from "path";
import { handleEnvelope, parseRequestBody } from "./server";
import { errorEnvelope } from "./protocol";
import { storagePath } from "../core/storage";
import { DEFAULT_SANDBOX_POLICY, SandboxAuditEvent, SandboxContext, SandboxPolicy, SandboxRuntime } from "../runtime/sandbox";

function argValue(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  if (idx < 0 || idx + 1 >= process.argv.length) return undefined;
  return process.argv[idx + 1];
}

const port = Number(argValue("--port") || process.env.PLOS_TRANSPORT_PORT || 8787);
const host = argValue("--host") || process.env.PLOS_TRANSPORT_HOST || "0.0.0.0";
const endpoint = argValue("--path") || process.env.PLOS_TRANSPORT_PATH || "/transport";

function loadSandboxPolicy(): SandboxPolicy | undefined {
  const policyPath = argValue("--sandbox-policy") || process.env.PLOS_SANDBOX_POLICY_PATH;
  if (!policyPath) return undefined;
  const resolved = path.resolve(policyPath);
  const parsed = JSON.parse(fs.readFileSync(resolved, "utf8"));
  const mapRule = (r: any) => ({
    id: String(r.id),
    effect: r.effect === "deny" ? "deny" : "allow",
    action: String(r.action),
    resource: String(r.resource),
    source: r.source ? String(r.source) : undefined,
    priority: typeof r.priority === "number" ? r.priority : undefined,
    constraints:
      r.constraints && typeof r.constraints === "object"
        ? {
            notAfterEpochMs: Number(r.constraints.not_after_epoch_ms) || undefined,
            notBeforeEpochMs: Number(r.constraints.not_before_epoch_ms) || undefined,
            maxBytes: Number(r.constraints.max_bytes) || undefined,
            allowedMethods: Array.isArray(r.constraints.allowed_methods) ? r.constraints.allowed_methods.map((x: any) => String(x)) : undefined,
          }
        : undefined,
  });
  return {
    policyVersion: parsed.policy_version ?? DEFAULT_SANDBOX_POLICY.policyVersion,
    defaultEffect: parsed.default_effect === "allow" ? "allow" : "deny",
    rules: Array.isArray(parsed.rules) ? parsed.rules.map((r: any) => mapRule(r)) : [],
    layers:
      parsed.layers && typeof parsed.layers === "object"
        ? {
            system: Array.isArray(parsed.layers.system) ? parsed.layers.system.map((r: any) => mapRule(r)) : [],
            workspace: Array.isArray(parsed.layers.workspace) ? parsed.layers.workspace.map((r: any) => mapRule(r)) : [],
            session: Array.isArray(parsed.layers.session) ? parsed.layers.session.map((r: any) => mapRule(r)) : [],
          }
        : undefined,
  };
}

function makeAuditSink(runId: string): (event: SandboxAuditEvent) => void {
  const auditDir = storagePath("audit");
  fs.mkdirSync(auditDir, { recursive: true });
  const auditPath = path.join(auditDir, `sandbox-${runId}.jsonl`);
  return (event: SandboxAuditEvent) => {
    fs.appendFileSync(auditPath, `${JSON.stringify(event)}\n`, "utf8");
  };
}

const policy = loadSandboxPolicy();
const sandbox = policy
  ? new SandboxRuntime(
      {
        runId: `srv-${Date.now()}`,
        actorId: process.env.PLOS_NODE_ID || "local-node",
        policyVersion: policy.policyVersion,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
        mode: (process.env.PLOS_SANDBOX_MODE === "compat" ? "compat" : "strict") as SandboxContext["mode"],
      },
      policy,
      makeAuditSink(`srv-${Date.now()}`)
    )
  : undefined;

const server = http.createServer((req, res) => {
  if (req.method !== "POST" || req.url !== endpoint) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(errorEnvelope("unknown", "bad_request", "unknown endpoint")));
    return;
  }

  let body = "";
  req.on("data", (chunk) => {
    body += chunk;
  });

  req.on("end", () => {
    const env = parseRequestBody(body);
    if (!env) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(errorEnvelope("unknown", "bad_request", "invalid envelope")));
      return;
    }

    const out = handleEnvelope(env, {
      nodeId: process.env.PLOS_NODE_ID || "local-node",
      maxEventsPerResponse: Number(process.env.PLOS_TRANSPORT_MAX_EVENTS || 500),
      maxBytesPerResponse: Number(process.env.PLOS_TRANSPORT_MAX_BYTES || 1024 * 1024),
      maxSegmentBytes: Number(process.env.PLOS_TRANSPORT_MAX_SEGMENT_BYTES || 4 * 1024 * 1024),
      sandbox,
    });

    const bytes = Buffer.byteLength(JSON.stringify(out), "utf8");
    if (bytes > Number(process.env.PLOS_TRANSPORT_MAX_BYTES || 1024 * 1024)) {
      res.statusCode = 413;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(errorEnvelope(env.requestId, "limit_exceeded", "response exceeds maxBytesPerResponse")));
      return;
    }

    res.statusCode = out.type.endsWith(".ok") ? 200 : 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(out));
  });
});

server.listen(port, host, () => {
  console.log(`Transport server listening on http://${host}:${port}${endpoint}`);
});
