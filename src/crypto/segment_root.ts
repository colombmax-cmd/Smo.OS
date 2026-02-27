import { readEvents } from "../core/log";
import { compareEvents } from "../core/compare";
import { jsonStableStringify } from "./canonical";
import { sha256Hex } from "./hash";
import { merkleRootHex } from "./merkle";
import { signBase64, verifyBase64, verifyBase64WithPublicKey } from "./sign";

function computeCurrentLogRoot() {
  const events = readEvents();
  const sorted = [...events].sort(compareEvents);

  const leaves = sorted.map((ev) => sha256Hex(jsonStableStringify(ev)));
  const root = merkleRootHex(leaves);

  return { eventCount: sorted.length, root };
}

const { eventCount, root } = computeCurrentLogRoot();

// Message signé : on ne signe pas juste root, on signe un mini “enveloppe” stable.
const messageToSign = `plos-segment-root:v0.2.1\nroot:${root}\nevents:${eventCount}`;

const signature = signBase64(messageToSign);
const ok = verifyBase64(messageToSign, signature);

console.log("Events:", eventCount);
console.log("Merkle root:", root);
console.log("Signature (base64):", signature);
console.log("Verify:", ok);