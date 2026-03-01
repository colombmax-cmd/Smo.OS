import { AnyEvent } from "./types";

function normOrigin(o: unknown): string {
  return typeof o === "string" && o.trim() ? o : "legacy";
}
function normSeq(s: unknown): number {
  return typeof s === "number" && Number.isFinite(s) ? s : 0;
}

export function compareEvents(a: AnyEvent, b: AnyEvent) {
  // 1) timestamp
  if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;

  // 2) origin (stable tie-break)
  const ao = normOrigin(a.origin);
  const bo = normOrigin(b.origin);
  if (ao !== bo) return ao.localeCompare(bo);

  // 3) seq (stable within origin)
  const as = normSeq(a.seq);
  const bs = normSeq(b.seq);
  if (as !== bs) return as - bs;

  // 4) id final
  return a.id.localeCompare(b.id);
}