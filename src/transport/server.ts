import * as fs from "fs";
import * as path from "path";
import { compareEvents } from "../core/compare";
import { readAllEvents } from "../core/log";
import { storageFileUrl, storagePath } from "../core/storage";
import { Envelope, TRANSPORT_PROTOCOL, errorEnvelope, isValidEnvelopeShape, okEnvelope } from "./protocol";
import { SandboxRuntime } from "../runtime/sandbox";

const DATA_DIR = storagePath();
const SEG_DIR = storagePath("segments");

type TransportServerOptions = {
  nodeId: string;
  maxEventsPerResponse: number;
  maxBytesPerResponse: number;
  maxSegmentBytes: number;
  sandbox?: SandboxRuntime;
};

function sandboxGuard(opts: TransportServerOptions, requestId: string, action: string, resource: string): Envelope | null {
  if (!opts.sandbox) return null;
  const decision = opts.sandbox.evaluate({ action, resource });
  if (decision.decision === "allow") return null;
  return errorEnvelope(requestId, "bad_request", `sandbox deny: ${decision.reasonCode}`);
}

function listSegmentIds(): string[] {
  if (!fs.existsSync(SEG_DIR)) return [];
  return fs
    .readdirSync(SEG_DIR)
    .filter((f) => f.startsWith("seg-") && f.endsWith(".manifest.json"))
    .map((f) => f.replace(".manifest.json", ""))
    .sort();
}

function loadManifest(segmentId: string): any {
  const p = path.join(SEG_DIR, `${segmentId}.manifest.json`);
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function loadSegmentJsonl(segmentId: string): string {
  const p = path.join(SEG_DIR, `${segmentId}.jsonl`);
  return fs.readFileSync(p, "utf8");
}

function namespacePrefix(eventType: string): string {
  const idx = eventType.indexOf("/");
  return idx < 0 ? eventType : eventType.slice(0, idx);
}

function toInt(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  if (!Number.isInteger(v)) return null;
  return v;
}

function parseCursor(raw: any): { ok: true; cursor: Record<string, number> } | { ok: false; reason: string } {
  if (raw === undefined) return { ok: true, cursor: {} };
  if (!raw || typeof raw !== "object") return { ok: false, reason: "cursorByOrigin must be an object" };

  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw)) {
    const n = toInt(v);
    if (n === null || n < 0) return { ok: false, reason: `cursor for origin '${k}' must be integer >= 0` };
    out[k] = n;
  }
  return { ok: true, cursor: out };
}

export function handleEnvelope(reqEnv: Envelope, opts: TransportServerOptions): Envelope {
  if (reqEnv.protocol !== TRANSPORT_PROTOCOL) {
    return errorEnvelope(reqEnv.requestId || "unknown", "bad_request", `unsupported protocol: ${reqEnv.protocol}`);
  }

  if (reqEnv.type === "plos.transport/hello") {
    const denied = sandboxGuard(opts, reqEnv.requestId, "registry.query", "transport://hello");
    if (denied) return denied;
    return okEnvelope(reqEnv.requestId, "plos.transport/hello.ok", {
      nodeId: opts.nodeId,
      supports: { eventsPull: true, segmentsPull: true, bundlesPull: false },
      limits: {
        maxEventsPerResponse: opts.maxEventsPerResponse,
        maxBytesPerResponse: opts.maxBytesPerResponse,
        maxSegmentBytes: opts.maxSegmentBytes,
      },
    });
  }

  if (reqEnv.type === "plos.transport/events.pull") {
    const denied = sandboxGuard(opts, reqEnv.requestId, "fs.read", storageFileUrl("events"));
    if (denied) return denied;
    const payload = reqEnv.payload || {};
    const parsedCursor = parseCursor(payload.cursorByOrigin);
    if (!parsedCursor.ok) return errorEnvelope(reqEnv.requestId, "cursor_invalid", parsedCursor.reason);

    const namespaceFilter = payload.namespaceFilter;
    if (namespaceFilter !== undefined && (!Array.isArray(namespaceFilter) || namespaceFilter.some((x) => typeof x !== "string"))) {
      return errorEnvelope(reqEnv.requestId, "bad_request", "namespaceFilter must be an array of strings");
    }

    const limitReq = payload.limit === undefined ? opts.maxEventsPerResponse : toInt(payload.limit);
    if (limitReq === null || limitReq < 1) return errorEnvelope(reqEnv.requestId, "bad_request", "limit must be integer >= 1");
    const limit = Math.min(limitReq, opts.maxEventsPerResponse);

    const all = readAllEvents().sort(compareEvents);
    const dedup: Record<string, any> = {};
    for (const ev of all) dedup[ev.id] = ev;

    const filtered = Object.values(dedup)
      .filter((ev: any) => {
        const origin = typeof ev.origin === "string" && ev.origin.length > 0 ? ev.origin : "legacy";
        const seq = typeof ev.seq === "number" ? ev.seq : 0;
        if (seq <= (parsedCursor.cursor[origin] ?? 0)) return false;
        if (!namespaceFilter) return true;
        const ns = namespacePrefix(String(ev.type || ""));
        return namespaceFilter.some((prefix: string) => ns.startsWith(prefix));
      })
      .sort(compareEvents);

    const events = filtered.slice(0, limit);
    const nextCursorByOrigin: Record<string, number> = { ...parsedCursor.cursor };
    for (const ev of events as any[]) {
      const origin = typeof ev.origin === "string" && ev.origin.length > 0 ? ev.origin : "legacy";
      const seq = typeof ev.seq === "number" ? ev.seq : 0;
      nextCursorByOrigin[origin] = Math.max(nextCursorByOrigin[origin] ?? 0, seq);
    }

    return okEnvelope(reqEnv.requestId, "plos.transport/events.pull.ok", {
      events,
      nextCursorByOrigin,
      hasMore: filtered.length > events.length,
    });
  }

  if (reqEnv.type === "plos.transport/segments.manifests.pull") {
    const denied = sandboxGuard(opts, reqEnv.requestId, "fs.read", `${storageFileUrl("segments")}/*.manifest.json`);
    if (denied) return denied;
    const payload = reqEnv.payload || {};
    const limitReq = payload.limit === undefined ? 100 : toInt(payload.limit);
    if (limitReq === null || limitReq < 1) return errorEnvelope(reqEnv.requestId, "bad_request", "limit must be integer >= 1");

    const fromSegmentId = payload.fromSegmentId;
    if (fromSegmentId !== undefined && typeof fromSegmentId !== "string") {
      return errorEnvelope(reqEnv.requestId, "bad_request", "fromSegmentId must be string");
    }

    const ids = listSegmentIds();
    const start = fromSegmentId ? Math.max(ids.indexOf(fromSegmentId), -1) + 1 : 0;
    const selected = ids.slice(start, start + limitReq);
    const manifests = selected.map((id) => loadManifest(id));

    return okEnvelope(reqEnv.requestId, "plos.transport/segments.manifests.pull.ok", {
      manifests,
      hasMore: start + selected.length < ids.length,
    });
  }

  if (reqEnv.type === "plos.transport/segments.content.pull") {
    const denied = sandboxGuard(opts, reqEnv.requestId, "fs.read", `${storageFileUrl("segments")}/*.jsonl`);
    if (denied) return denied;
    const payload = reqEnv.payload || {};
    const segmentId = payload.segmentId;
    if (!segmentId || typeof segmentId !== "string") {
      return errorEnvelope(reqEnv.requestId, "bad_request", "segmentId is required");
    }

    try {
      const manifest = loadManifest(segmentId);
      const eventsJsonl = loadSegmentJsonl(segmentId);
      if (Buffer.byteLength(eventsJsonl, "utf8") > opts.maxSegmentBytes) {
        return errorEnvelope(reqEnv.requestId, "limit_exceeded", "segment content exceeds maxSegmentBytes");
      }
      return okEnvelope(reqEnv.requestId, "plos.transport/segments.content.pull.ok", {
        segmentId,
        eventsJsonl,
        manifest,
      });
    } catch {
      return errorEnvelope(reqEnv.requestId, "bad_request", `segment not found: ${segmentId}`);
    }
  }

  return errorEnvelope(reqEnv.requestId, "unsupported_type", `unsupported type: ${reqEnv.type}`);
}

export function parseRequestBody(raw: string): Envelope | null {
  try {
    const obj = JSON.parse(raw);
    if (!isValidEnvelopeShape(obj)) return null;
    return obj;
  } catch {
    return null;
  }
}
