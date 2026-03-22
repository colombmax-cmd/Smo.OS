import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { execFileSync } from "child_process";
import { compareEvents } from "../core/compare";
import { readAllEvents, writeEventsAll } from "../core/log";
import { storagePath } from "../core/storage";
import { jsonStableStringify } from "../crypto/canonical";
import { sha256Hex } from "../crypto/hash";
import { verifyAnchor } from "../crypto/anchor";

const DATA_DIR = storagePath();
const SEG_DIR = storagePath("segments");
const ANCHOR_DIR = storagePath("anchors");

export type ExportProfile = "events-only" | "segments-only" | "hybrid";

type BundleManifest = {
  specVersion: "0.1.0";
  bundleVersion?: "0.1" | "0.1.0"; // legacy alias
  createdAt: number;
  createdBy: string;
  exportProfile: ExportProfile;
  content: {
    eventCount: number;
    segmentCount: number;
    anchorCount: number;
  };
  spec: {
    core: string;
    security?: string;
    anchoring?: string;
  };
  checksums: Record<string, string>;
};

function ensureTooling() {
  try {
    execFileSync("zip", ["-v"], { stdio: "ignore" });
    execFileSync("unzip", ["-v"], { stdio: "ignore" });
  } catch {
    throw new Error("zip/unzip commands are required for .plosbundle support");
  }
}

function normalizeText(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function listSegmentIdsInDir(segDir: string): string[] {
  if (!fs.existsSync(segDir)) return [];
  return fs
    .readdirSync(segDir)
    .filter((f) => f.startsWith("seg-") && f.endsWith(".manifest.json"))
    .map((f) => f.replace(".manifest.json", ""))
    .sort();
}

function writeNormalized(root: string, rel: string, content: string) {
  const p = path.join(root, rel);
  ensureDir(path.dirname(p));
  fs.writeFileSync(p, normalizeText(content), "utf8");
}

function checksumForFile(p: string): string {
  const content = fs.readFileSync(p, "utf8");
  return `sha256:${sha256Hex(content)}`;
}

function zipFolder(root: string, outPath: string) {
  const entries = execFileSync("find", [".", "-type", "f"], { cwd: root, encoding: "utf8" })
    .split("\n")
    .filter(Boolean)
    .map((s) => s.replace(/^\.\//, ""))
    .sort();

  if (entries.length === 0) throw new Error("nothing to package");

  const absOut = path.resolve(outPath);
  const args = ["-X", "-q", absOut, ...entries];
  execFileSync("zip", args, { cwd: root, stdio: "ignore" });
}

function unzipToDir(bundlePath: string, outDir: string) {
  ensureDir(outDir);
  execFileSync("unzip", ["-q", path.resolve(bundlePath), "-d", outDir], { stdio: "ignore" });
}

export function exportPortableBundle(outPath: string, profile: ExportProfile, createdBy: string) {
  ensureTooling();

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "plosbundle-export-"));
  const payloadFiles: string[] = [];

  try {
    const manifest: BundleManifest = {
      specVersion: "0.1.0",
      bundleVersion: "0.1",
      createdAt: Date.now(),
      createdBy,
      exportProfile: profile,
      content: { eventCount: 0, segmentCount: 0, anchorCount: 0 },
      spec: { core: "0.1.1", security: "0.2.1", anchoring: "0.1" },
      checksums: {},
    };

    if (profile === "events-only" || profile === "hybrid") {
      const events = readAllEvents().sort(compareEvents);
      const eventsJsonl = events.map((e) => jsonStableStringify(e)).join("\n") + (events.length ? "\n" : "");
      writeNormalized(tmp, "events/events.jsonl", eventsJsonl);
      payloadFiles.push("events/events.jsonl");
      manifest.content.eventCount = events.length;
    }

    if (profile === "segments-only" || profile === "hybrid") {
      const segmentIds = listSegmentIdsInDir(SEG_DIR);
      for (const segmentId of segmentIds) {
        const jsonlPath = path.join(SEG_DIR, `${segmentId}.jsonl`);
        const manifestPath = path.join(SEG_DIR, `${segmentId}.manifest.json`);
        if (!fs.existsSync(jsonlPath) || !fs.existsSync(manifestPath)) continue;

        writeNormalized(tmp, `segments/${segmentId}.jsonl`, fs.readFileSync(jsonlPath, "utf8"));
        writeNormalized(tmp, `segments/${segmentId}.manifest.json`, fs.readFileSync(manifestPath, "utf8"));
        payloadFiles.push(`segments/${segmentId}.jsonl`, `segments/${segmentId}.manifest.json`);

        const anchorPath = path.join(ANCHOR_DIR, `${segmentId}.anchor.json`);
        if (fs.existsSync(anchorPath)) {
          writeNormalized(tmp, `anchors/${segmentId}.anchor.json`, fs.readFileSync(anchorPath, "utf8"));
          payloadFiles.push(`anchors/${segmentId}.anchor.json`);
          manifest.content.anchorCount += 1;
        }
      }
      manifest.content.segmentCount = segmentIds.length;
    }

    if (payloadFiles.length === 0) {
      throw new Error("bundle has no payload data to export");
    }

    for (const rel of payloadFiles.sort()) {
      manifest.checksums[rel] = checksumForFile(path.join(tmp, rel));
    }

    writeNormalized(tmp, "bundle.json", jsonStableStringify(manifest) + "\n");

    zipFolder(tmp, outPath);

    return {
      outPath: path.resolve(outPath),
      eventCount: manifest.content.eventCount,
      segmentCount: manifest.content.segmentCount,
      anchorCount: manifest.content.anchorCount,
      profile,
    };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function validateEventShape(ev: any) {
  if (!ev || typeof ev !== "object") throw new Error("event must be object");
  const required = ["id", "type", "entityId", "payload", "timestamp"];
  for (const k of required) {
    if (!(k in ev)) throw new Error(`event missing required field: ${k}`);
  }
}

export function importPortableBundle(bundlePath: string) {
  ensureTooling();

  if (!fs.existsSync(bundlePath)) throw new Error(`bundle not found: ${bundlePath}`);

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "plosbundle-import-"));

  try {
    unzipToDir(bundlePath, tmp);

    const bundleJsonPath = path.join(tmp, "bundle.json");
    if (!fs.existsSync(bundleJsonPath)) throw new Error("bundle_invalid_structure: missing bundle.json");

    const manifest = JSON.parse(fs.readFileSync(bundleJsonPath, "utf8")) as BundleManifest;
    const bundleSpecVersion = (manifest as any).specVersion ?? manifest.bundleVersion;
    if (bundleSpecVersion !== "0.1.0" && bundleSpecVersion !== "0.1") throw new Error(`bundle_unsupported_version: ${String(bundleSpecVersion)}`);

    if (!manifest.checksums || typeof manifest.checksums !== "object") {
      throw new Error("bundle_manifest_invalid: checksums map is required");
    }

    const eventsPath = path.join(tmp, "events", "events.jsonl");
    const hasEvents = fs.existsSync(eventsPath);
    const segmentsDir = path.join(tmp, "segments");
    const hasSegments = fs.existsSync(segmentsDir);

    if (!hasEvents && !hasSegments) throw new Error("bundle_invalid_structure: missing events/ and segments/");

    for (const [rel, expected] of Object.entries(manifest.checksums)) {
      const abs = path.join(tmp, rel);
      if (!fs.existsSync(abs)) throw new Error(`bundle_invalid_structure: checksum entry missing file ${rel}`);
      const actual = checksumForFile(abs);
      if (actual !== expected) throw new Error(`bundle_checksum_mismatch: ${rel}`);
    }

    const importedEvents: any[] = [];
    if (hasEvents) {
      const lines = normalizeText(fs.readFileSync(eventsPath, "utf8")).split("\n").filter(Boolean);
      for (const line of lines) {
        const ev = JSON.parse(line);
        validateEventShape(ev);
        importedEvents.push(ev);
      }
    }

    if (hasSegments) {
      const segIds = listSegmentIdsInDir(segmentsDir);
      for (const segId of segIds) {
        const segJsonl = path.join(segmentsDir, `${segId}.jsonl`);
        const segManifest = path.join(segmentsDir, `${segId}.manifest.json`);
        if (!fs.existsSync(segJsonl) || !fs.existsSync(segManifest)) {
          throw new Error(`bundle_invalid_structure: missing segment pair for ${segId}`);
        }

        ensureDir(SEG_DIR);
        fs.copyFileSync(segJsonl, path.join(SEG_DIR, `${segId}.jsonl`));
        fs.copyFileSync(segManifest, path.join(SEG_DIR, `${segId}.manifest.json`));

        const anchor = path.join(tmp, "anchors", `${segId}.anchor.json`);
        if (fs.existsSync(anchor)) {
          ensureDir(ANCHOR_DIR);
          fs.copyFileSync(anchor, path.join(ANCHOR_DIR, `${segId}.anchor.json`));
          const anchorCheck = verifyAnchor(segId);
          if (!anchorCheck.ok) {
            throw new Error(`bundle_anchor_verify_failed: ${segId}: ${anchorCheck.errors.join("; ")}`);
          }
        }
      }
    }

    if (importedEvents.length > 0) {
      const local = readAllEvents();
      const byId: Record<string, any> = {};
      for (const ev of local) byId[ev.id] = ev;
      for (const ev of importedEvents) byId[ev.id] = ev;
      const merged = Object.values(byId).sort(compareEvents);
      writeEventsAll(merged);
    }

    return {
      importedEvents: importedEvents.length,
      importedSegments: hasSegments ? listSegmentIdsInDir(segmentsDir).length : 0,
      profile: manifest.exportProfile,
    };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
