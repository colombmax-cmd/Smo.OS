import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { spawnSync } from "child_process";

const REPO_ROOT = path.resolve(process.cwd());
const TS_NODE_BIN = path.join(REPO_ROOT, "node_modules", ".bin", "ts-node");
const SEAL_SCRIPT = path.join(REPO_ROOT, "src", "crypto", "segment_seal_cli.ts");
const VERIFY_SCRIPT = path.join(REPO_ROOT, "src", "crypto", "segment_verify.ts");
const ROTATE_SCRIPT = path.join(REPO_ROOT, "src", "crypto", "key_rotate_cli.ts");
const STORAGE_ENV = "PLOS_STORAGE_DIR";

function fixtureStorageDir(dir: string): string {
  return path.join(dir, "shared-store");
}

function runTs(scriptPath: string, cwd: string, args: string[] = []) {
  return spawnSync(TS_NODE_BIN, [scriptPath, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, [STORAGE_ENV]: fixtureStorageDir(cwd) },
  });
}

function writeBase(dir: string) {
  const dataDir = fixtureStorageDir(dir);
  fs.mkdirSync(dataDir, { recursive: true });

  const e1 = {
    id: "00000000-0000-0000-0000-000000009201",
    type: "plos.core/EntityCreated",
    entityId: "entity-rotate-1",
    payload: { name: "RotateFixture", createdAt: 1700000000000 },
    timestamp: 1700000000000,
    origin: "default",
    seq: 1,
    seen: { default: 1 },
  };

  fs.writeFileSync(path.join(dataDir, "events.jsonl"), JSON.stringify(e1) + "\n", "utf8");
  fs.writeFileSync(
    path.join(dataDir, "meta.json"),
    JSON.stringify({ origin: "default", nextSeq: 2, seen: { default: 1 } }, null, 2) + "\n",
    "utf8"
  );
}

function appendSecondEvent(dir: string) {
  const dataDir = fixtureStorageDir(dir);
  const e2 = {
    id: "00000000-0000-0000-0000-000000009202",
    type: "plos.core/EntityUpdated",
    entityId: "entity-rotate-1",
    payload: { status: "done" },
    timestamp: 1700000001000,
    origin: "default",
    seq: 2,
    seen: { default: 2 },
  };

  fs.writeFileSync(path.join(dataDir, "events.jsonl"), JSON.stringify(e2) + "\n", "utf8");
  fs.writeFileSync(
    path.join(dataDir, "meta.json"),
    JSON.stringify({ origin: "default", nextSeq: 3, seen: { default: 2 } }, null, 2) + "\n",
    "utf8"
  );
}

function readManifest(dir: string, seg: string) {
  const p = path.join(fixtureStorageDir(dir), "segments", `${seg}.manifest.json`);
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function writeManifest(dir: string, seg: string, manifest: any) {
  const p = path.join(fixtureStorageDir(dir), "segments", `${seg}.manifest.json`);
  fs.writeFileSync(p, JSON.stringify(manifest, null, 2) + "\n", "utf8");
}

function setupRotatedFixture(dir: string) {
  writeBase(dir);

  const seal1 = runTs(SEAL_SCRIPT, dir);
  if (seal1.status !== 0) throw new Error(`seal1 failed\n${seal1.stdout}\n${seal1.stderr}`);

  const rotate = runTs(ROTATE_SCRIPT, dir);
  if (rotate.status !== 0) throw new Error(`rotate failed\n${rotate.stdout}\n${rotate.stderr}`);

  appendSecondEvent(dir);
  const seal2 = runTs(SEAL_SCRIPT, dir);
  if (seal2.status !== 0) throw new Error(`seal2 failed\n${seal2.stdout}\n${seal2.stderr}`);
}

function runCase(name: string, mutate: ((dir: string) => void) | undefined, expectCode: number, expectText: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `smo-os-${name}-`));
  setupRotatedFixture(dir);
  mutate?.(dir);

  const verify = runTs(VERIFY_SCRIPT, dir);
  const code = verify.status ?? 1;
  const output = `${verify.stdout}\n${verify.stderr}`;
  const ok = code === expectCode && output.includes(expectText);

  console.log(`${ok ? "OK" : "KO"}: ${name}`);
  if (!ok) {
    console.log(`  expected code=${expectCode}, got=${code}`);
    console.log(`  expected output include: ${expectText}`);
    console.log("  --- output ---");
    console.log(output);
    process.exitCode = 1;
  }
}

runCase("case-001-rotation-happy", undefined, 0, "Result: ALL OK ✅");

runCase(
  "case-002-post-rotation-old-key-fails",
  (dir) => {
    const seg2 = readManifest(dir, "seg-000002");
    const seg1 = readManifest(dir, "seg-000001");
    seg2.keyId = seg1.keyId;
    writeManifest(dir, "seg-000002", seg2);
  },
  1,
  "is after key notAfter"
);

if (process.exitCode && process.exitCode !== 0) {
  console.log("\nCrypto key rotation conformance: FAIL ❌");
  process.exit(process.exitCode);
}

console.log("\nCrypto key rotation conformance: 2/2 OK ✅");
