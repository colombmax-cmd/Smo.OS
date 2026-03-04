import * as fs from "fs";
import * as path from "path";
import { jsonStableStringify } from "./canonical";
import { sha256Hex } from "./hash";

const DATA_DIR = path.resolve(process.cwd(), "data");
const SEG_DIR = path.join(DATA_DIR, "segments");
const ANCHOR_DIR = path.join(DATA_DIR, "anchors");

const ANCHOR_VERSION = "0.1";
const SUPPORTED_BACKEND = "hash-attest-v1";

export type AnchorRecord = {
  version: string;
  backend: string;
  segmentId: string;
  segmentRoot: string;
  origin: string;
  keyId: string;
  manifestCreatedAt: number;
  anchoredAt: number;
  anchorRef: string;
  proof: {
    type: "hash-attestation";
    payloadHash: string;
  };
};

type Manifest = {
  segmentId: string;
  root: string;
  origin?: string;
  keyId?: string;
  createdAt: number;
};

function ensureAnchorDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(ANCHOR_DIR)) fs.mkdirSync(ANCHOR_DIR, { recursive: true });
}

function listSegmentIds(): string[] {
  if (!fs.existsSync(SEG_DIR)) return [];
  return fs
    .readdirSync(SEG_DIR)
    .filter((f) => f.startsWith("seg-") && f.endsWith(".manifest.json"))
    .map((f) => f.replace(".manifest.json", ""))
    .sort();
}

function resolveSegmentId(requested?: string): string {
  const ids = listSegmentIds();
  if (ids.length === 0) throw new Error("No segments found.");
  if (requested) {
    if (!ids.includes(requested)) throw new Error(`Unknown segmentId: ${requested}`);
    return requested;
  }
  return ids[ids.length - 1];
}

function loadManifest(segmentId: string): Manifest {
  const p = path.join(SEG_DIR, `${segmentId}.manifest.json`);
  if (!fs.existsSync(p)) throw new Error(`Manifest not found for ${segmentId}`);
  return JSON.parse(fs.readFileSync(p, "utf8")) as Manifest;
}

function anchorPath(segmentId: string): string {
  return path.join(ANCHOR_DIR, `${segmentId}.anchor.json`);
}

function computeAnchorPayloadHash(record: Omit<AnchorRecord, "anchorRef" | "proof">): string {
  const payload = {
    version: record.version,
    backend: record.backend,
    segmentId: record.segmentId,
    segmentRoot: record.segmentRoot,
    origin: record.origin,
    keyId: record.keyId,
    manifestCreatedAt: record.manifestCreatedAt,
    anchoredAt: record.anchoredAt,
  };
  return `sha256:${sha256Hex(jsonStableStringify(payload))}`;
}

export function publishAnchor(segmentIdArg?: string): AnchorRecord {
  ensureAnchorDir();
  const segmentId = resolveSegmentId(segmentIdArg);
  const manifest = loadManifest(segmentId);

  if (!manifest.origin) throw new Error(`manifest for ${segmentId} is missing origin`);
  if (!manifest.keyId) throw new Error(`manifest for ${segmentId} is missing keyId`);

  const base: Omit<AnchorRecord, "anchorRef" | "proof"> = {
    version: ANCHOR_VERSION,
    backend: SUPPORTED_BACKEND,
    segmentId,
    segmentRoot: manifest.root,
    origin: manifest.origin,
    keyId: manifest.keyId,
    manifestCreatedAt: manifest.createdAt,
    anchoredAt: Date.now(),
  };

  const payloadHash = computeAnchorPayloadHash(base);

  const record: AnchorRecord = {
    ...base,
    anchorRef: payloadHash,
    proof: {
      type: "hash-attestation",
      payloadHash,
    },
  };

  fs.writeFileSync(anchorPath(segmentId), JSON.stringify(record, null, 2) + "\n", "utf8");
  return record;
}

export function verifyAnchor(segmentIdArg?: string): { ok: boolean; errors: string[]; anchor?: AnchorRecord } {
  const errors: string[] = [];
  const segmentId = resolveSegmentId(segmentIdArg);

  const manifest = loadManifest(segmentId);
  const p = anchorPath(segmentId);
  if (!fs.existsSync(p)) {
    errors.push(`anchor file not found for ${segmentId}`);
    return { ok: false, errors };
  }

  const anchor = JSON.parse(fs.readFileSync(p, "utf8")) as AnchorRecord;

  if (anchor.version !== ANCHOR_VERSION) errors.push(`unsupported anchor version: ${anchor.version}`);
  if (anchor.backend !== SUPPORTED_BACKEND) errors.push(`unsupported backend: ${anchor.backend}`);
  if (anchor.segmentId !== segmentId) errors.push(`anchor segmentId mismatch: ${anchor.segmentId} != ${segmentId}`);
  if (anchor.segmentRoot !== manifest.root) {
    errors.push(`anchor segmentRoot mismatch: ${anchor.segmentRoot} != ${manifest.root}`);
  }
  if (manifest.origin && anchor.origin !== manifest.origin) {
    errors.push(`anchor origin mismatch: ${anchor.origin} != ${manifest.origin}`);
  }
  if (manifest.keyId && anchor.keyId !== manifest.keyId) {
    errors.push(`anchor keyId mismatch: ${anchor.keyId} != ${manifest.keyId}`);
  }

  if (anchor.proof?.type !== "hash-attestation") {
    errors.push("anchor proof.type must be hash-attestation");
  }

  const base: Omit<AnchorRecord, "anchorRef" | "proof"> = {
    version: anchor.version,
    backend: anchor.backend,
    segmentId: anchor.segmentId,
    segmentRoot: anchor.segmentRoot,
    origin: anchor.origin,
    keyId: anchor.keyId,
    manifestCreatedAt: anchor.manifestCreatedAt,
    anchoredAt: anchor.anchoredAt,
  };

  const expectedPayloadHash = computeAnchorPayloadHash(base);

  if (anchor.anchorRef !== expectedPayloadHash) {
    errors.push(`anchorRef mismatch: ${anchor.anchorRef} != ${expectedPayloadHash}`);
  }

  if (anchor.proof?.payloadHash !== expectedPayloadHash) {
    errors.push(`proof.payloadHash mismatch: ${anchor.proof?.payloadHash} != ${expectedPayloadHash}`);
  }

  return { ok: errors.length === 0, errors, anchor };
}
