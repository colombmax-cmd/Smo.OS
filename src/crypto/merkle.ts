import { sha256Hex } from "./hash";

/**
 * Merkle root "pairwise + duplicate last if odd"
 *
 * Input: leaves = liste de hash hex (sha256) déjà calculés
 * Output: root hash hex
 *
 * Important:
 * - si leaves est vide, on renvoie sha256("") pour avoir une valeur définie
 * - si impair, on duplique le dernier pour former une paire
 */
export function merkleRootHex(leaves: string[]): string {
  if (leaves.length === 0) return sha256Hex("");

  let level = [...leaves];

  while (level.length > 1) {
    const next: string[] = [];

    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = level[i + 1] ?? left; // duplication si impair
      next.push(sha256Hex(left + right));
    }

    level = next;
  }

  return level[0];
}

/**
 * Helper pratique: construit les feuilles en hashant des strings,
 * puis calcule la racine.
 *
 * (On l'utilisera plus tard quand on aura la canonicalisation JSON.)
 */
export function merkleRootFromStringsHex(items: string[]): string {
  const leaves = items.map((s) => sha256Hex(s));
  return merkleRootHex(leaves);
}