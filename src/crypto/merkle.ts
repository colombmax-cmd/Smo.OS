import { sha256Hex } from "./hash";

/**
 * Merkle root "pairwise + duplicate last if odd"
 *
 * Input: leaves = list of precomputed SHA-256 hex digests
 * Output: root hash hex
 *
 * Important:
 * - if leaves is empty, return sha256("") as a deterministic defined value
 * - if odd length, duplicate the last leaf to form a pair
 */
export function merkleRootHex(leaves: string[]): string {
  if (leaves.length === 0) return sha256Hex("");

  let level = [...leaves];

  while (level.length > 1) {
    const next: string[] = [];

    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = level[i + 1] ?? left; // duplicate on odd level length
      next.push(sha256Hex(left + right));
    }

    level = next;
  }

  return level[0];
}

/**
 * Convenience helper: hash each input string into leaves,
 * then compute the Merkle root.
 *
 * (Useful when data is not yet canonicalized JSON.)
 */
export function merkleRootFromStringsHex(items: string[]): string {
  const leaves = items.map((s) => sha256Hex(s));
  return merkleRootHex(leaves);
}