#!/usr/bin/env node
import { compareEvents } from "../core/compare";
import { readAllEvents, writeEventsAll } from "../core/log";
import { mergeSeen } from "../core/meta";
import { makeEnvelope, postEnvelope } from "./client";

function argValue(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  if (idx < 0 || idx + 1 >= process.argv.length) return undefined;
  return process.argv[idx + 1];
}

function buildCursor(events: any[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const ev of events) {
    const origin = typeof ev.origin === "string" && ev.origin.length > 0 ? ev.origin : "legacy";
    const seq = typeof ev.seq === "number" ? ev.seq : 0;
    out[origin] = Math.max(out[origin] ?? 0, seq);
  }
  return out;
}

async function main() {
  const url = argValue("--url") || "http://127.0.0.1:8787/transport";
  const limit = Number(argValue("--limit") || 200);

  const hello = await postEnvelope(
    url,
    makeEnvelope("plos.transport/hello", {
      nodeId: "local-client",
      supports: { eventsPull: true, segmentsPull: false, bundlesPull: false },
    })
  );

  if (hello.type === "plos.transport/error") {
    throw new Error(`hello failed: ${hello.payload.code} ${hello.payload.message}`);
  }

  const local = readAllEvents();
  const cursor = buildCursor(local);

  const pulled = await postEnvelope(
    url,
    makeEnvelope("plos.transport/events.pull", {
      cursorByOrigin: cursor,
      limit,
    })
  );

  if (pulled.type === "plos.transport/error") {
    throw new Error(`events.pull failed: ${pulled.payload.code} ${pulled.payload.message}`);
  }

  const events = Array.isArray(pulled.payload.events) ? pulled.payload.events : [];
  const byId: Record<string, any> = {};
  for (const ev of local) byId[ev.id] = ev;
  for (const ev of events) byId[ev.id] = ev;

  const merged = Object.values(byId).sort(compareEvents);
  writeEventsAll(merged);

  if (pulled.payload.nextCursorByOrigin && typeof pulled.payload.nextCursorByOrigin === "object") {
    mergeSeen(pulled.payload.nextCursorByOrigin as Record<string, number>);
  }

  console.log(`Pulled ${events.length} events from ${url}. Local log now has ${merged.length} events.`);
  if (pulled.payload.hasMore) {
    console.log("Remote has more events (hasMore=true), rerun pull to continue.");
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
