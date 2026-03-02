import * as fs from "fs";
import * as path from "path";
import { readEvents, writeEventsAll } from "../core/log";
import { compareEvents } from "../core/compare";
import { jsonStableStringify } from "./canonical";
import { sha256Hex } from "./hash";
import { merkleRootHex } from "./merkle";
import { signBase64, verifyBase64, verifyBase64WithPublicKey } from "./sign";
import { getActiveKeyId } from "./sign";
import { loadMeta } from "../core/meta";

const DATA_DIR = path.resolve(process.cwd(), "data");
const SEG_DIR = path.join(DATA_DIR, "segments");

function ensureSegDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(SEG_DIR)) fs.mkdirSync(SEG_DIR, { recursive: true });
}

function listExistingSegments(): string[] {
  ensureSegDir();
  return fs
    .readdirSync(SEG_DIR)
    .filter((f) => f.startsWith("seg-") && f.endsWith(".manifest.json"))
    .map((f) => f.replace(".manifest.json", ""))
    .sort();
}

function nextSegmentId(): string {
  const segs = listExistingSegments();
  if (segs.length === 0) return "seg-000001";
  const last = segs[segs.length - 1]; // e.g. "seg-000012"
  const n = parseInt(last.split("-")[1], 10);
  const next = (n + 1).toString().padStart(6, "0");
  return `seg-${next}`;
}

function loadPrevSegmentRoot(): string | null {
  const segs = listExistingSegments();
  if (segs.length === 0) return null;
  const lastId = segs[segs.length - 1];
  const manifestPath = path.join(SEG_DIR, `${lastId}.manifest.json`);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  return manifest.root ?? null;
}

function computeMerkleRootForEvents(events: any[]) {
  const sorted = [...events].sort(compareEvents);
  const leaves = sorted.map((ev) => sha256Hex(jsonStableStringify(ev)));
  const root = merkleRootHex(leaves);
  return { sorted, root };
}

export function sealAllCurrentEventsIntoNewSegment() {
  ensureSegDir();

  const events = readEvents();
  if (events.length === 0) {
    console.log("No events to seal.");
    return;
  }

  const segmentId = nextSegmentId();
  const prevSegmentRoot = loadPrevSegmentRoot();

  const { sorted, root } = computeMerkleRootForEvents(events);

  // 1) Write segment payload (JSONL)
  const segPath = path.join(SEG_DIR, `${segmentId}.jsonl`);
  const content = sorted.map((e) => JSON.stringify(e)).join("\n") + "\n";
  fs.writeFileSync(segPath, content, "utf8");

  // 2) Build manifest
  const manifest = {
    version: "0.2.1",
    segmentId,
    createdAt: Date.now(),
    origin: loadMeta().origin,
    keyId: getActiveKeyId(),
    events: sorted.length,
    firstEventId: sorted[0]?.id ?? null,
    lastEventId: sorted[sorted.length - 1]?.id ?? null,
    root: `sha256:${root}`,
    prevSegmentRoot: prevSegmentRoot ? prevSegmentRoot : null,
    algo: {
      canonical: "json-stable-v1",
      hash: "sha-256",
      merkle: "pairwise-dup-last",
      sig: "ed25519",
    },
    signature: "", // filled after signing
  };

  // 3) Sign stable manifest payload (manifest with empty signature field)
  const messageToSign = jsonStableStringify({ ...manifest, signature: "" });
  const signature = signBase64(messageToSign);
  manifest.signature = signature;

  // 4) Verify before writing (sanity check)
  const ok = verifyBase64(jsonStableStringify({ ...manifest, signature: "" }), manifest.signature);
  if (!ok) {
    throw new Error("Signature verification failed right after signing (should never happen).");
  }

  // 5) Write manifest
  const manifestPath = path.join(SEG_DIR, `${segmentId}.manifest.json`);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");

  // 6) Simple strategy: clear active log buffer after sealing.
  // With this strategy, segments are the archive and events.jsonl is only a staging buffer.
  writeEventsAll([]);

  console.log("Sealed segment:", segmentId);
  console.log("  Events:", sorted.length);
  console.log("  Root:", manifest.root);
  console.log("  Manifest:", manifestPath);
  console.log("  Segment:", segPath);
}

// Intentionally no auto-run side effects.
// This module only exposes sealing primitives for CLI/runtime callers.
