import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { spawnSync } from "child_process";

type CaseDef = {
  name: string;
  mutate?: (fixtureDir: string) => void;
  expectCode: number;
  expectIncludes: string;
};

const REPO_ROOT = path.resolve(process.cwd());
const TS_NODE_BIN = path.join(REPO_ROOT, "node_modules", ".bin", "ts-node");
const SEAL_SCRIPT = path.join(REPO_ROOT, "src", "crypto", "segment_seal_cli.ts");
const VERIFY_SCRIPT = path.join(REPO_ROOT, "src", "crypto", "segment_verify.ts");
const STORAGE_ENV = "PLOS_STORAGE_DIR";

function fixtureStorageDir(dir: string): string {
  return path.join(dir, "shared-store");
}

function writeFixtureBase(dir: string) {
  const dataDir = fixtureStorageDir(dir);
  fs.mkdirSync(dataDir, { recursive: true });

  const event = {
    id: "00000000-0000-0000-0000-000000009001",
    type: "plos.core/EntityCreated",
    entityId: "entity-1",
    payload: { name: "Fixture", createdAt: 1700000000000 },
    timestamp: 1700000000000,
    origin: "default",
    seq: 1,
    seen: { default: 1 },
  };

  fs.writeFileSync(path.join(dataDir, "events.jsonl"), JSON.stringify(event) + "\n", "utf8");
  fs.writeFileSync(
    path.join(dataDir, "meta.json"),
    JSON.stringify({ origin: "default", nextSeq: 2, seen: { default: 1 } }, null, 2) + "\n",
    "utf8"
  );
}

function sealFixture(dir: string) {
  const sealed = spawnSync(TS_NODE_BIN, [SEAL_SCRIPT], {
    cwd: dir,
    encoding: "utf8",
    env: { ...process.env, [STORAGE_ENV]: fixtureStorageDir(dir) },
  });
  if (sealed.status !== 0) {
    throw new Error(`Failed to seal fixture:\n${sealed.stdout}\n${sealed.stderr}`);
  }
}

function readManifest(dir: string): any {
  const manifestPath = path.join(fixtureStorageDir(dir), "segments", "seg-000001.manifest.json");
  return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
}

function writeManifest(dir: string, manifest: any) {
  const manifestPath = path.join(fixtureStorageDir(dir), "segments", "seg-000001.manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
}

function readRegistry(dir: string): any {
  const regPath = path.join(fixtureStorageDir(dir), "keys", "registry.json");
  return JSON.parse(fs.readFileSync(regPath, "utf8"));
}

function writeRegistry(dir: string, registry: any) {
  const regPath = path.join(fixtureStorageDir(dir), "keys", "registry.json");
  fs.writeFileSync(regPath, JSON.stringify(registry, null, 2) + "\n", "utf8");
}


function alignRegistryToManifestTime(dir: string) {
  const manifest = readManifest(dir);
  const registry = readRegistry(dir);
  const key = registry.keys[manifest.keyId];
  if (key && typeof key.notBefore === "number" && key.notBefore > manifest.createdAt) {
    key.notBefore = manifest.createdAt;
    writeRegistry(dir, registry);
  }
}

const cases: CaseDef[] = [
  {
    name: "case-001-key-policy-happy",
    expectCode: 0,
    expectIncludes: "Result: ALL OK ✅",
  },
  {
    name: "case-002-unknown-keyid-fails",
    mutate: (dir) => {
      const manifest = readManifest(dir);
      manifest.keyId = "ghost#ed25519-1";
      writeManifest(dir, manifest);
    },
    expectCode: 1,
    expectIncludes: "unknown keyId in registry",
  },
  {
    name: "case-003-revoked-key-fails",
    mutate: (dir) => {
      const manifest = readManifest(dir);
      const registry = readRegistry(dir);
      const key = registry.keys[manifest.keyId];
      key.status = "revoked";
      key.revokedAt = manifest.createdAt;
      writeRegistry(dir, registry);
    },
    expectCode: 1,
    expectIncludes: "key is revoked",
  },
  {
    name: "case-004-expired-key-fails",
    mutate: (dir) => {
      const manifest = readManifest(dir);
      const registry = readRegistry(dir);
      const key = registry.keys[manifest.keyId];
      key.notAfter = manifest.createdAt - 1;
      writeRegistry(dir, registry);
    },
    expectCode: 1,
    expectIncludes: "is after key notAfter",
  },
  {
    name: "case-005-algo-mismatch-fails",
    mutate: (dir) => {
      const manifest = readManifest(dir);
      const registry = readRegistry(dir);
      const key = registry.keys[manifest.keyId];
      key.alg = "rsa";
      writeRegistry(dir, registry);
    },
    expectCode: 1,
    expectIncludes: "key algorithm mismatch",
  },
];

function runCase(c: CaseDef) {
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), `smo-os-${c.name}-`));
  writeFixtureBase(fixtureDir);
  sealFixture(fixtureDir);
  alignRegistryToManifestTime(fixtureDir);
  c.mutate?.(fixtureDir);

  const verify = spawnSync(TS_NODE_BIN, [VERIFY_SCRIPT], {
    cwd: fixtureDir,
    encoding: "utf8",
    env: { ...process.env, [STORAGE_ENV]: fixtureStorageDir(fixtureDir) },
  });
  const output = `${verify.stdout}\n${verify.stderr}`;
  const code = verify.status ?? 1;

  const codeOk = code === c.expectCode;
  const textOk = output.includes(c.expectIncludes);
  const ok = codeOk && textOk;

  console.log(`${ok ? "OK" : "KO"}: ${c.name}`);
  if (!ok) {
    console.log(`  expected code=${c.expectCode}, got=${code}`);
    console.log(`  expected text to include: ${c.expectIncludes}`);
    console.log("  --- output ---");
    console.log(output);
    process.exitCode = 1;
  }
}

for (const c of cases) runCase(c);

if (process.exitCode && process.exitCode !== 0) {
  console.log("\nCrypto key policy conformance: FAIL ❌");
  process.exit(process.exitCode);
}

console.log(`\nCrypto key policy conformance: ${cases.length}/${cases.length} OK ✅`);
