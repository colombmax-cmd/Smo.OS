import * as fs from "fs";
import * as path from "path";
import { Event } from "./types";

const DATA_DIR = path.resolve(process.cwd(), "data");
const LOG_PATH = path.join(DATA_DIR, "events.jsonl");
const SEG_DIR = path.join(DATA_DIR, "segments");

// Ensure data directory and log file exist
function ensureStorage() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(LOG_PATH)) {
    fs.writeFileSync(LOG_PATH, "", { encoding: "utf8" });
  }
}

export function appendEvent(event: Event) {
  ensureStorage();
  const line = JSON.stringify(event);
  fs.appendFileSync(LOG_PATH, line + "\n", { encoding: "utf8" });
}

export function readEvents(): Event[] {
  ensureStorage();
  const raw = fs.readFileSync(LOG_PATH, { encoding: "utf8" });
  if (!raw.trim()) return [];
  const lines = raw.split("\n").filter(Boolean);
  const events: Event[] = [];
  for (const l of lines) {
    try {
      const parsed = JSON.parse(l);
      events.push(parsed);
    } catch (e) {
      // ignore malformed line but log to console for debugging
      console.warn("Ignored malformed log line:", l);
    }
  }
  return events;
}

// Utility to write full events (used for syncing)
export function writeEventsAll(events: Event[]) {
  ensureStorage();
  const content = events.map((e) => JSON.stringify(e)).join("\n") + "\n";
  fs.writeFileSync(LOG_PATH, content, { encoding: "utf8" });
}

function readJsonlEvents(filePath: string): Event[] {
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, "utf8");
  if (!raw.trim()) return [];
  return raw
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

export function readSegmentEvents(): Event[] {
  if (!fs.existsSync(SEG_DIR)) return [];
  const segFiles = fs
    .readdirSync(SEG_DIR)
    .filter((f) => f.startsWith("seg-") && f.endsWith(".jsonl"))
    .sort(); // seg-000001, seg-000002, ...

  const all: Event[] = [];
  for (const f of segFiles) {
    const p = path.join(SEG_DIR, f);
    all.push(...readJsonlEvents(p));
  }
  return all;
}

/**
 * Lecture complète : segments (scellés) + buffer courant.
 */
export function readAllEvents(): Event[] {
  const seg = readSegmentEvents();
  const buf = readJsonlEvents(LOG_PATH);
  return [...seg, ...buf];
}