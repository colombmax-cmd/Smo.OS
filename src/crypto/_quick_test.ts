import { sha256Hex } from "./hash";
import { merkleRootFromStringsHex } from "./merkle";

const a = "event A";
const b = "event B";
const c = "event C";

const root1 = merkleRootFromStringsHex([a, b, c]);
console.log("root1:", root1);

// Modifie 1 caractère
const root2 = merkleRootFromStringsHex([a, b + "!", c]);
console.log("root2:", root2);

console.log("changed?", root1 !== root2);

// Option: montrer aussi une feuille
console.log("leaf(event A):", sha256Hex(a));

import { jsonStableStringify } from "./canonical";

const obj1 = { b: 1, a: 2 };
const obj2 = { a: 2, b: 1 };

const s1 = jsonStableStringify(obj1);
const s2 = jsonStableStringify(obj2);

console.log("stable equal?", s1 === s2);