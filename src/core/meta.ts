import * as fs from "fs";
import * as path from "path";

export interface Meta {
  origin: string;
  nextSeq: number;
}

const DATA_DIR = path.resolve(process.cwd(), "data");
const META_PATH = path.join(DATA_DIR, "meta.json");

function ensureMetaFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  if (!fs.existsSync(META_PATH)) {
    const defaultMeta: Meta = { origin: "default", nextSeq: 1 };
    fs.writeFileSync(META_PATH, JSON.stringify(defaultMeta, null, 2), "utf8");
  }
}

export function loadMeta(): Meta {
  ensureMetaFile();
  const raw = fs.readFileSync(META_PATH, "utf8");
  return JSON.parse(raw) as Meta;
}

export function saveMeta(meta: Meta) {
  ensureMetaFile();
  fs.writeFileSync(META_PATH, JSON.stringify(meta, null, 2), "utf8");
}

export function setOrigin(origin: string) {
  const meta = loadMeta();
  meta.origin = origin;
  saveMeta(meta);
}

export function allocateSeq(): { origin: string; seq: number } {
  const meta = loadMeta();
  const origin = meta.origin || "default";
  const seq = meta.nextSeq || 1;
  meta.nextSeq = seq + 1;
  saveMeta(meta);
  return { origin, seq };
}