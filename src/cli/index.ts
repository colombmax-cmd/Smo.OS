#!/usr/bin/env node
import { v4 as uuidv4 } from "uuid";
import * as path from "path";
import * as fs from "fs";
import { appendEvent, readAllEvents, readEvents, writeEventsAll } from "../core/log";
import { rebuildState } from "../core/state";
import { Event } from "../core/types";
import { allocateSeqWithSeen, setOrigin, loadMeta, mergeSeen, resetMeta } from "../core/meta";
import { compareEvents } from "../core/compare";
import { maybeSeal } from "../crypto/maybe_seal";


const [, , command, ...args] = process.argv;

function usage() {
  console.log("smo.os CLI — commands:");
  console.log("  create <name>");
  console.log("  update <entityId> <key=value>");
  console.log("  list");
  console.log("  export");
  console.log("  sync <otherLogPath>");
  console.log("");
  console.log("Examples:");
  console.log('  npm run dev create "Stabiliser finances 2026"');
  console.log("  npm run dev list");
}

if (!command) {
  usage();
  process.exit(0);
}

if (command === "create") {
  const name = args.join(" ").trim();
  if (!name) {
    console.error("Provide a name.");
    process.exit(1);
  }

  const entityId = uuidv4();
  const { origin, seq, seen } = allocateSeqWithSeen();
  const event: Event = {
    id: uuidv4(),
    type: "plos.core/EntityCreated",
    entityId,
    payload: { name, status: "active", createdAt: Date.now() },
    timestamp: Date.now(),
    origin,
    seq,
    seen,
  };

  appendEvent(event);
  const sealed = maybeSeal();
  console.log("Created entity:", entityId, sealed ? "(sealed)" : "");
  process.exit(0);
}

if (command === "update") {
  const entityId = args[0];
  const kv = args[1];
  if (!entityId || !kv) {
    console.error("Usage: update <entityId> <key=value>");
    process.exit(1);
  }
  const [key, value] = kv.split("=");
  const { origin, seq, seen } = allocateSeqWithSeen();
  const event: Event = {
    id: uuidv4(),
    type: "plos.core/StateUpdated",
    entityId,
    payload: { [key]: guessType(value) },
    timestamp: Date.now(),
    origin,
    seq,
    seen,
  };
  
  appendEvent(event);
  const sealed = maybeSeal();
  console.log("Updated", entityId, sealed ? "(sealed)" : "");
  process.exit(0);
}

if (command === "list") {
  const events = readAllEvents();
  const state = rebuildState(events);
  console.log(JSON.stringify(state, null, 2));
  process.exit(0);
}

if (command === "export") {
  const events = readAllEvents();
  console.log(JSON.stringify(events, null, 2));
  process.exit(0);
}

// sync: copy missing events from an external events.jsonl file
if (command === "sync") {
  const otherPath = args[0];
  if (!otherPath) {
    console.error("Usage: sync <path-to-other-events.jsonl>");
    process.exit(1);
  }

  const resolved = path.resolve(otherPath);
  if (!fs.existsSync(resolved)) {
    console.error("File not found:", resolved);
    process.exit(1);
  }

  const content = fs.readFileSync(resolved, { encoding: "utf8" }).split("\n").filter(Boolean);
  const externalEvents: Event[] = content.map((l) => JSON.parse(l));

  const localEvents = readAllEvents();
  const allById: Record<string, Event> = {};
  for (const e of localEvents) allById[e.id] = e;
  for (const e of externalEvents) allById[e.id] = e;

  const merged = Object.values(allById).sort(compareEvents);
  const maxByOrigin: Record<string, number> = {};
  for (const e of merged) {
    const org = (e as any).origin ?? "legacy";
    const seq = (e as any).seq ?? 0;
    maxByOrigin[org] = Math.max(maxByOrigin[org] ?? 0, seq);
  }
mergeSeen(maxByOrigin);
  writeEventsAll(merged);
  const sealed = maybeSeal();
  console.log("Synced. Local log now contains", merged.length, "events.", sealed ? "(sealed)" : "");
  process.exit(0);
}

if (command === "origin") {
  const name = (args[0] || "").trim();
  if (!name) {
    console.log("Current origin:", loadMeta().origin);
    console.log("Usage: origin <name>");
    process.exit(0);
  }
  setOrigin(name);
  console.log("Origin set to:", name);
  process.exit(0);
}

if (command === "reset") {
  // wipes local log + resets meta
  const fs = require("fs");
  const path = require("path");
  const logPath = path.resolve(process.cwd(), "data", "events.jsonl");

  try { fs.unlinkSync(logPath); } catch {}
  resetMeta(loadMeta().origin || "default");

  console.log("Reset done: data/events.jsonl removed, meta reset.");
  process.exit(0);
}

if (command === "conflicts") {
  const events = readAllEvents();
  const state = rebuildState(events);
  console.log(JSON.stringify(state.conflicts, null, 2));
  process.exit(0);
}

if (command === "resolve") {
  const entityId = args[0];
  const field = args[1];
  const chosenEventId = args[2];

  if (!entityId || !field || !chosenEventId) {
    console.error("Usage: resolve <entityId> <field> <chosenEventId>");
    process.exit(1);
  }

  const { origin, seq, seen } = allocateSeqWithSeen();

  const event: Event = {
    id: uuidv4(),
    type: "plos.core/ConflictResolved",
    entityId,
    payload: { field, chosenEventId },
    timestamp: Date.now(),
    origin,
    seq,
    seen,
  };

  appendEvent(event);
  const sealed = maybeSeal();
  console.log("Conflict resolved:", { entityId, field, chosenEventId }, sealed ? "(sealed)" : "");
  process.exit(0);
}
if (command === "export-bundle") {
  const outPath = args[0];
  if (!outPath) {
    console.error("Usage: export-bundle <path.jsonl>");
    process.exit(1);
  }

  const events = readEvents().sort(compareEvents);

  const header = {
    kind: "plos.bundle/header",
    bundleVersion: "0.3.0",
    bundleId: uuidv4(),
    createdAt: Date.now(),
    origin: loadMeta().origin,
  };

  const lines = [
    JSON.stringify(header),
    ...events.map((e) =>
      JSON.stringify({ kind: "plos.bundle/event", event: e })
    ),
  ];

  require("fs").writeFileSync(outPath, lines.join("\n") + "\n", "utf8");

  console.log(`Bundle exported: ${outPath} (${events.length} events)`);
  process.exit(0);
}

if (command === "import-bundle") {
  const inPath = args[0];
  if (!inPath) {
    console.error("Usage: import-bundle <path.jsonl>");
    process.exit(1);
  }

  const fs = require("fs");
  if (!fs.existsSync(inPath)) {
    console.error("File not found:", inPath);
    process.exit(1);
  }

  const raw = fs.readFileSync(inPath, "utf8").trim();
  if (!raw) {
    console.error("Empty bundle");
    process.exit(1);
  }

  const lines = raw.split("\n").filter(Boolean);

  const bundleEvents: any[] = [];

  for (const line of lines) {
    const obj = JSON.parse(line);
    if (obj.kind === "plos.bundle/event" && obj.event) {
      bundleEvents.push(obj.event);
    }
  }

  const localEvents = readEvents();

  const byId: Record<string, any> = {};
  for (const e of localEvents) byId[e.id] = e;
  for (const e of bundleEvents) byId[e.id] = e;

  const merged = Object.values(byId).sort(compareEvents);

  writeEventsAll(merged);
  maybeSeal();

  console.log(
    `Bundle imported: ${bundleEvents.length} events, log now ${merged.length}`
  );

  process.exit(0);
}

usage();

// helper: try to convert "true"/"123" to types
function guessType(v: string) {
  if (v === "true") return true;
  if (v === "false") return false;
  if (!isNaN(Number(v))) return Number(v);
  return v;
}