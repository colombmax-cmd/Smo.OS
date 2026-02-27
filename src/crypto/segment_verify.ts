import * as fs from "fs";
import * as path from "path";
import { compareEvents } from "../core/compare";
import { jsonStableStringify } from "./canonical";
import { sha256Hex } from "./hash";
import { merkleRootHex } from "./merkle";
import { verifyBase64, verifyBase64WithPublicKey, getPublicKeyPemForKeyId } from "./sign";

const DATA_DIR = path.resolve(process.cwd(), "data");
const SEG_DIR = path.join(DATA_DIR, "segments");
const SUPPORTED_VERSION = "0.2.1";
const SUPPORTED = {
  canonical: "json-stable-v1",
  hash: "sha-256",
  merkle: "pairwise-dup-last",
  sig: "ed25519",
};

type Manifest = {
  version: string;
  segmentId: string;
  createdAt: number;
  origin?: string;
  keyId?: string;
  events: number;
  firstEventId: string | null;
  lastEventId: string | null;
  root: string; // e.g. "sha256:abcd..."
  prevSegmentRoot: string | null;
  algo: {
    canonical: string;
    hash: string;
    merkle: string;
    sig: string;
  };
  signature: string; // base64
};

function listSegmentIds(): string[] {
  if (!fs.existsSync(SEG_DIR)) return [];
  return fs
    .readdirSync(SEG_DIR)
    .filter((f) => f.startsWith("seg-") && f.endsWith(".manifest.json"))
    .map((f) => f.replace(".manifest.json", ""))
    .sort();
}

function loadManifest(segmentId: string): Manifest {
  const p = path.join(SEG_DIR, `${segmentId}.manifest.json`);
  return JSON.parse(fs.readFileSync(p, "utf8")) as Manifest;
}

function readSegmentEvents(segmentId: string): any[] {
  const p = path.join(SEG_DIR, `${segmentId}.jsonl`);
  const raw = fs.readFileSync(p, "utf8");
  const lines = raw.split("\n").filter(Boolean);
  const events: any[] = [];
  for (const l of lines) {
    events.push(JSON.parse(l));
  }
  return events;
}

function computeRootFromEvents(events: any[]): string {
  const sorted = [...events].sort(compareEvents);
  const leaves = sorted.map((ev) => sha256Hex(jsonStableStringify(ev)));
  const rootHex = merkleRootHex(leaves);
  return `sha256:${rootHex}`;
}

function verifyManifestSignature(manifest: Manifest): boolean {
  // On vérifie la signature sur le manifest SANS la signature (sinon circulaire)
  const unsigned = { ...manifest, signature: "" };
  const msg = jsonStableStringify(unsigned);

  // ✅ Nouveau comportement:
  // - Si keyId est présent: on utilise la clé publique du registry (interop)
  // - Sinon: fallback legacy (clé publique locale)
  if (manifest.keyId) {
    try {
      const pubPem = getPublicKeyPemForKeyId(manifest.keyId);
      return verifyBase64WithPublicKey(msg, manifest.signature, pubPem);
    } catch {
      return false;
    }
  }

  return verifyBase64(msg, manifest.signature);
}

function validateManifestShape(manifest: Manifest): { ok: boolean; errors: string[] } {
  const errors: string[] = [];

  // version
  if (manifest.version !== SUPPORTED_VERSION) {
    errors.push(`unsupported version: ${manifest.version} (expected ${SUPPORTED_VERSION})`);
  }

  // algo
  if (!manifest.algo) {
    errors.push("missing algo");
  } else {
    if (manifest.algo.canonical !== SUPPORTED.canonical)
      errors.push(`unsupported algo.canonical: ${manifest.algo.canonical} (expected ${SUPPORTED.canonical})`);
    if (manifest.algo.hash !== SUPPORTED.hash)
      errors.push(`unsupported algo.hash: ${manifest.algo.hash} (expected ${SUPPORTED.hash})`);
    if (manifest.algo.merkle !== SUPPORTED.merkle)
      errors.push(`unsupported algo.merkle: ${manifest.algo.merkle} (expected ${SUPPORTED.merkle})`);
    if (manifest.algo.sig !== SUPPORTED.sig)
      errors.push(`unsupported algo.sig: ${manifest.algo.sig} (expected ${SUPPORTED.sig})`);
  }

  // root format
  if (typeof manifest.root !== "string" || !manifest.root.startsWith("sha256:")) {
    errors.push(`invalid root format: ${manifest.root} (expected "sha256:<hex>")`);
  } else {
    const hex = manifest.root.slice("sha256:".length);
    if (!/^[0-9a-f]{64}$/.test(hex)) errors.push("root hex must be 64 lowercase hex chars");
  }

  // signature
  if (typeof manifest.signature !== "string" || manifest.signature.length < 10) {
    errors.push("missing/invalid signature");
  }

  // keying: V0.2.1 exige keyId (interop)
  if (!manifest.keyId) errors.push("missing keyId (required in v0.2.1)");
  if (!manifest.origin) errors.push("missing origin (required in v0.2.1)");

  // events count sanity
  if (typeof manifest.events !== "number" || manifest.events < 0) errors.push("invalid events count");

  return { ok: errors.length === 0, errors };
}

export function verifyAllSegments() {
  const segIds = listSegmentIds();
  if (segIds.length === 0) {
    console.log("No segments found.");
    return;
  }

  console.log(`Found ${segIds.length} segment(s).`);

  let prevRoot: string | null = null;
  let allOk = true;

  for (const segId of segIds) {
    const manifest = loadManifest(segId);
    const events = readSegmentEvents(segId);

    const shape = validateManifestShape(manifest);
    const shapeOk = shape.ok;

    const computedRoot = computeRootFromEvents(events);
    const rootOk = computedRoot === manifest.root;

    const sigOk = verifyManifestSignature(manifest);

    const chainOk =
      (manifest.prevSegmentRoot ?? null) === (prevRoot ?? null);

    const eventsCountOk = events.length === manifest.events;

    const ok = shapeOk && rootOk && sigOk && chainOk && eventsCountOk;
    allOk = allOk && ok;

    console.log(`\n${segId}`);
    console.log(`  events: ${events.length} (manifest says ${manifest.events}) -> ${eventsCountOk ? "OK" : "KO"}`);
    console.log(`  root:   ${rootOk ? "OK" : "KO"}`);
    if (!rootOk) {
      console.log(`    computed: ${computedRoot}`);
      console.log(`    manifest: ${manifest.root}`);
    }
    console.log(`  sig:    ${sigOk ? "OK" : "KO"}`);
    console.log(`  chain:  ${chainOk ? "OK" : "KO"}`);
    if (!chainOk) {
      console.log(`    expected prev: ${prevRoot}`);
      console.log(`    manifest prev: ${manifest.prevSegmentRoot}`);
    }
    console.log(`  manifest: ${shapeOk ? "OK" : "KO"}`);
    if (!shapeOk) {
      for (const err of shape.errors) console.log(`    - ${err}`);
    }
    if (!allOk) process.exit(1);

    prevRoot = manifest.root;
  }

  console.log(`\nResult: ${allOk ? "ALL OK ✅" : "FAIL ❌"}`);
}

verifyAllSegments();