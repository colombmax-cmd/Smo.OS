import * as fs from "fs";
import * as path from "path";

export interface Meta {
  origin: string;
  nextSeq: number;
  seen: Record<string, number>; // max seq known per origin
}

const DATA_DIR = path.resolve(process.cwd(), "data");
const META_PATH = path.join(DATA_DIR, "meta.json");

function ensureMetaFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  if (!fs.existsSync(META_PATH)) {
    const defaultMeta: Meta = { origin: "default", nextSeq: 1, seen: {} };
    fs.writeFileSync(META_PATH, JSON.stringify(defaultMeta, null, 2), "utf8");
  }
}

export function loadMeta(): Meta {
  ensureMetaFile();
  return JSON.parse(fs.readFileSync(META_PATH, "utf8")) as Meta;
}

export function saveMeta(meta: Meta) {
  ensureMetaFile();
  fs.writeFileSync(META_PATH, JSON.stringify(meta, null, 2), "utf8");
}

export function setOrigin(origin: string) {
  const meta = loadMeta();
  meta.origin = origin;
  // also ensure self exists in seen map
  meta.seen[origin] = meta.seen[origin] ?? 0;
  saveMeta(meta);
}

export function allocateSeqWithSeen(): { origin: string; seq: number; seen: Record<string, number> } {
  const meta = loadMeta();
  const origin = meta.origin || "default";

  meta.seen[origin] = meta.seen[origin] ?? 0;

  const seq = meta.nextSeq || 1;

  // Snapshot of what we currently know (before emitting)
  const seenSnapshot = { ...meta.seen };

  // After emitting, we consider our own seq as known
  meta.seen[origin] = Math.max(meta.seen[origin], seq);
  meta.nextSeq = seq + 1;

  saveMeta(meta);
  return { origin, seq, seen: seenSnapshot };
}

// Update local meta.seen with maxima (used after sync)
export function mergeSeen(maxByOrigin: Record<string, number>) {
  const meta = loadMeta();
  for (const [org, maxSeq] of Object.entries(maxByOrigin)) {
    meta.seen[org] = Math.max(meta.seen[org] ?? 0, maxSeq);
  }
  // keep nextSeq consistent for our origin
  const o = meta.origin || "default";
  const selfMax = meta.seen[o] ?? 0;
  meta.nextSeq = Math.max(meta.nextSeq ?? 1, selfMax + 1);
  saveMeta(meta);
}

// Optional: reset helper
export function resetMeta(origin = "default") {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const meta: Meta = { origin, nextSeq: 1, seen: { [origin]: 0 } };
  fs.writeFileSync(META_PATH, JSON.stringify(meta, null, 2), "utf8");
}