#!/usr/bin/env node
import * as http from "http";
import { handleEnvelope, parseRequestBody } from "./server";
import { errorEnvelope } from "./protocol";

function argValue(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  if (idx < 0 || idx + 1 >= process.argv.length) return undefined;
  return process.argv[idx + 1];
}

const port = Number(argValue("--port") || process.env.PLOS_TRANSPORT_PORT || 8787);
const host = argValue("--host") || process.env.PLOS_TRANSPORT_HOST || "0.0.0.0";
const endpoint = argValue("--path") || process.env.PLOS_TRANSPORT_PATH || "/transport";

const server = http.createServer((req, res) => {
  if (req.method !== "POST" || req.url !== endpoint) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(errorEnvelope("unknown", "bad_request", "unknown endpoint")));
    return;
  }

  let body = "";
  req.on("data", (chunk) => {
    body += chunk;
  });

  req.on("end", () => {
    const env = parseRequestBody(body);
    if (!env) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(errorEnvelope("unknown", "bad_request", "invalid envelope")));
      return;
    }

    const out = handleEnvelope(env, {
      nodeId: process.env.PLOS_NODE_ID || "local-node",
      maxEventsPerResponse: Number(process.env.PLOS_TRANSPORT_MAX_EVENTS || 500),
      maxBytesPerResponse: Number(process.env.PLOS_TRANSPORT_MAX_BYTES || 1024 * 1024),
      maxSegmentBytes: Number(process.env.PLOS_TRANSPORT_MAX_SEGMENT_BYTES || 4 * 1024 * 1024),
    });

    const bytes = Buffer.byteLength(JSON.stringify(out), "utf8");
    if (bytes > Number(process.env.PLOS_TRANSPORT_MAX_BYTES || 1024 * 1024)) {
      res.statusCode = 413;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(errorEnvelope(env.requestId, "limit_exceeded", "response exceeds maxBytesPerResponse")));
      return;
    }

    res.statusCode = out.type.endsWith(".ok") ? 200 : 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(out));
  });
});

server.listen(port, host, () => {
  console.log(`Transport server listening on http://${host}:${port}${endpoint}`);
});
