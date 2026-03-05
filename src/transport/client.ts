import * as http from "http";
import * as https from "https";
import { URL } from "url";
import { Envelope, TRANSPORT_PROTOCOL } from "./protocol";

export function postEnvelope(urlRaw: string, envelope: Envelope): Promise<Envelope> {
  const u = new URL(urlRaw);
  const transport = u.protocol === "https:" ? https : http;

  const body = JSON.stringify(envelope);

  return new Promise((resolve, reject) => {
    const req = transport.request(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port ? Number(u.port) : undefined,
        path: `${u.pathname}${u.search}`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => {
          raw += chunk;
        });
        res.on("end", () => {
          try {
            const parsed = JSON.parse(raw);
            resolve(parsed);
          } catch (e) {
            reject(new Error(`Invalid JSON response: ${(e as Error).message}`));
          }
        });
      }
    );

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

export function makeEnvelope(type: string, payload: any): Envelope {
  return {
    protocol: TRANSPORT_PROTOCOL,
    type,
    requestId: `req-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    sentAt: Date.now(),
    payload,
  };
}
