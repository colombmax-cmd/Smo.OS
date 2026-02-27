/**
 * JSON stable stringify
 *
 * - Trie les clés d'objet alphabétiquement
 * - Applique récursivement
 * - Garde les tableaux dans l'ordre
 *
 * Retourne une string JSON déterministe.
 */
export function jsonStableStringify(value: any): string {
  return JSON.stringify(sortRecursively(value));
}

function sortRecursively(value: any): any {
  if (Array.isArray(value)) {
    return value.map(sortRecursively);
  }

  if (value !== null && typeof value === "object") {
    const sortedKeys = Object.keys(value).sort();
    const result: any = {};

    for (const key of sortedKeys) {
      result[key] = sortRecursively(value[key]);
    }

    return result;
  }

  return value;
}