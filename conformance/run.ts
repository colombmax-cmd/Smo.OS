import * as fs from "fs";
import * as path from "path";
import assert from "assert";
import { compareEvents } from "../src/core/compare";
import { rebuildState } from "../src/core/state";
import { AnyEvent } from "../src/core/types";

function readJsonl(filePath: string): AnyEvent[] {
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, "utf8").trim();
  if (!raw) return [];
  return raw.split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

function mergeEvents(a: AnyEvent[], b: AnyEvent[]): AnyEvent[] {
  const byId: Record<string, AnyEvent> = {};
  for (const e of a) byId[e.id] = e;
  for (const e of b) byId[e.id] = e;
  return Object.values(byId).sort(compareEvents);
}

function runCase(caseDir: string) {
  const aPath = path.join(caseDir, "a.jsonl");
  const bPath = path.join(caseDir, "b.jsonl");
  const expectedPath = path.join(caseDir, "expected.state.json");

  const a = readJsonl(aPath);
  const b = readJsonl(bPath);

  const merged = mergeEvents(a, b);
  const mergedCountPath = path.join(caseDir, "expected.merged.count.json");
  if (fs.existsSync(mergedCountPath)) {
    const { count } = JSON.parse(fs.readFileSync(mergedCountPath, "utf8"));
    assert.strictEqual(merged.length, count, "merged event count mismatch");
  }
  const state = rebuildState(merged);

  const expected = JSON.parse(fs.readFileSync(expectedPath, "utf8"));
  assert.deepStrictEqual(state, expected);
  console.log(`OK: ${path.basename(caseDir)}`);
}

function main() {
  const base = path.resolve(process.cwd(), "conformance");
  const dirs = fs
    .readdirSync(base)
    .map((d) => path.join(base, d))
    .filter((p) => fs.statSync(p).isDirectory());

  let ok = 0;
  for (const dir of dirs) {
    runCase(dir);
    ok++;
  }
  console.log(`\nConformance: ${ok}/${ok} OK ✅`);
}

main();