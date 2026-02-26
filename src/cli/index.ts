#!/usr/bin/env node
import { v4 as uuidv4 } from "uuid";
import * as path from "path";
import * as fs from "fs";
import { appendEvent, readEvents, writeEventsAll } from "../core/log";
import { rebuildState } from "../core/state";
import { Event } from "../core/types";
import { allocateSeq, setOrigin, loadMeta } from "../core/meta";
import { compareEvents } from "../core/compare";

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
  const event: Event = {
    id: uuidv4(),
    type: "EntityCreated",
    entityId,
    payload: { name, status: "active", createdAt: Date.now() },
    timestamp: Date.now(),
  };

  const { origin, seq } = allocateSeq();

  const event: Event = {
    id: uuidv4(),
    type: "EntityCreated",
    entityId,
    payload: { name, status: "active", createdAt: Date.now() },
    timestamp: Date.now(),
    origin,
    seq,
  };

  appendEvent(event);
  console.log("Created entity:", entityId);
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
  const event: Event = {
    id: uuidv4(),
    type: "StateUpdated",
    entityId,
    payload: { [key]: guessType(value) },
    timestamp: Date.now(),0
  };

  const { origin, seq } = allocateSeq();

  const event: Event = {
    id: uuidv4(),
    type: "StateUpdated",
    entityId,
    payload: { [key]: guessType(value) },
    timestamp: Date.now(),
    origin,
    seq,
  };
  
  appendEvent(event);
  console.log("Updated", entityId);
  process.exit(0);
}

if (command === "list") {
  const events = readEvents();
  const state = rebuildState(events);
  console.log(JSON.stringify(state, null, 2));
  process.exit(0);
}

if (command === "export") {
  const events = readEvents();
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

  const localEvents = readEvents();
  const allById: Record<string, Event> = {};
  for (const e of localEvents) allById[e.id] = e;
  for (const e of externalEvents) allById[e.id] = e;

  const merged = Object.values(allById).sort(compareEvents);
  writeEventsAll(merged);
  console.log("Synced. Local log now contains", merged.length, "events.");
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

usage();

// helper: try to convert "true"/"123" to types
function guessType(v: string) {
  if (v === "true") return true;
  if (v === "false") return false;
  if (!isNaN(Number(v))) return Number(v);
  return v;
}