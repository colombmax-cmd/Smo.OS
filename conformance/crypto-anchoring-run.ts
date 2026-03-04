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
const ANCHOR_PUBLISH_SCRIPT = path.join(REPO_ROOT, "src", "crypto", "anchor_publish_cli.ts");
const ANCHOR_VERIFY_SCRIPT = path.join(REPO_ROOT, "src", "crypto", "anchor_verify_cli.ts");

function writeFixtureBase(dir: string) {
  const dataDir = path.join(dir, "data");
  fs.mkdirSync(dataDir, { recursive: true });

  const event = {
    id: "00000000-0000-0000-0000-000000009101",
    type: "plos.core/EntityCreated",
    entityId: "entity-anchor-1",
    payload: { name: "AnchorFixture", createdAt: 1700000000000 },
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
  const sealed = spawnSync(TS_NODE_BIN, [SEAL_SCRIPT], { cwd: dir, encoding: "utf8" });
  if (sealed.status !== 0) {
    throw new Error(`Failed to seal fixture:\n${sealed.stdout}\n${sealed.stderr}`);
  }
}

function publishAnchor(dir: string) {
  const anchored = spawnSync(TS_NODE_BIN, [ANCHOR_PUBLISH_SCRIPT], { cwd: dir, encoding: "utf8" });
  if (anchored.status !== 0) {
    throw new Error(`Failed to publish anchor:\n${anchored.stdout}\n${anchored.stderr}`);
  }
}

function readAnchor(dir: string): any {
  const p = path.join(dir, "data", "anchors", "seg-000001.anchor.json");
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function writeAnchor(dir: string, anchor: any) {
  const p = path.join(dir, "data", "anchors", "seg-000001.anchor.json");
  fs.writeFileSync(p, JSON.stringify(anchor, null, 2) + "\n", "utf8");
}

const cases: CaseDef[] = [
  {
    name: "case-001-anchor-happy",
    expectCode: 0,
    expectIncludes: "Anchor verification: ALL OK ✅",
  },
  {
    name: "case-002-anchor-missing-file",
    mutate: (dir) => {
      fs.rmSync(path.join(dir, "data", "anchors", "seg-000001.anchor.json"));
    },
    expectCode: 1,
    expectIncludes: "anchor file not found",
  },
  {
    name: "case-003-anchor-root-mismatch",
    mutate: (dir) => {
      const anchor = readAnchor(dir);
      anchor.segmentRoot = "sha256:" + "0".repeat(64);
      writeAnchor(dir, anchor);
    },
    expectCode: 1,
    expectIncludes: "anchor segmentRoot mismatch",
  },
  {
    name: "case-004-anchor-ref-mismatch",
    mutate: (dir) => {
      const anchor = readAnchor(dir);
      anchor.anchorRef = "sha256:" + "f".repeat(64);
      writeAnchor(dir, anchor);
    },
    expectCode: 1,
    expectIncludes: "anchorRef mismatch",
  },
  {
    name: "case-005-anchor-proof-mismatch",
    mutate: (dir) => {
      const anchor = readAnchor(dir);
      anchor.proof.payloadHash = "sha256:" + "a".repeat(64);
      writeAnchor(dir, anchor);
    },
    expectCode: 1,
    expectIncludes: "proof.payloadHash mismatch",
  },
];

function runCase(c: CaseDef) {
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), `smo-os-${c.name}-`));
  writeFixtureBase(fixtureDir);
  sealFixture(fixtureDir);
  publishAnchor(fixtureDir);
  c.mutate?.(fixtureDir);

  const verify = spawnSync(TS_NODE_BIN, [ANCHOR_VERIFY_SCRIPT], { cwd: fixtureDir, encoding: "utf8" });
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
  console.log("\nCrypto anchoring conformance: FAIL ❌");
  process.exit(process.exitCode);
}

console.log(`\nCrypto anchoring conformance: ${cases.length}/${cases.length} OK ✅`);
