import { createHash } from "crypto";

/**
 * SHA-256 d'une chaîne UTF-8, rendu en hex.
 * - Entrée: string
 * - Sortie: string hex (64 chars)
 */
export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}