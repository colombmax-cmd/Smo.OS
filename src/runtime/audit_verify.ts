import * as crypto from "crypto";
import { SandboxAuditEvent } from "./sandbox";

function hashPayload(ev: Omit<SandboxAuditEvent, "eventHash">): string {
  return `sha256-${crypto.createHash("sha256").update(JSON.stringify(ev)).digest("hex")}`;
}

export function verifyAuditChain(events: SandboxAuditEvent[]): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  let prev: string | null = null;

  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    if (ev.prevEventHash !== prev) {
      errors.push(`chain mismatch at index=${i}`);
    }
    const { eventHash: _drop, ...payload } = ev;
    const expected = hashPayload(payload);
    if (ev.eventHash !== expected) {
      errors.push(`hash mismatch at index=${i}`);
    }
    prev = ev.eventHash;
  }

  return { ok: errors.length === 0, errors };
}
