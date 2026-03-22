import * as fs from "fs";
import * as path from "path";
import { generateKeyPairSync, sign, verify } from "crypto";
import { ensureStorageRoot, resolveManagedPath, storagePath, toManagedPath } from "../core/storage";

const DATA_DIR = storagePath();
const KEYS_DIR = storagePath("keys");

// Legacy default keypair paths (kept for compatibility with existing local data).
const LEGACY_PRIV_PATH = path.join(KEYS_DIR, "ed25519.priv.pem");
const LEGACY_PUB_PATH = path.join(KEYS_DIR, "ed25519.pub.pem");

const REG_PATH = path.join(KEYS_DIR, "registry.json");
const REGISTRY_VERSION = "0.1";

export type KeyStatus = "active" | "retired" | "revoked";

export type RegistryKey = {
  origin: string;
  alg: "ed25519";
  pubPath: string;
  privPath?: string;
  status: KeyStatus;
  createdAt: number;
  notBefore: number;
  notAfter?: number;
  replaces?: string;
  revokedAt?: number;
  reason?: string;
};

type RegistryV1 = {
  version: typeof REGISTRY_VERSION;
  activeKeyId: string;
  keys: Record<string, RegistryKey>;
};

type LegacyRegistry = {
  active: string;
  keys: Record<string, { origin: string; alg: "ed25519"; pubPath: string }>;
};

function ensureKeysDir() {
  ensureStorageRoot();
  if (!fs.existsSync(KEYS_DIR)) fs.mkdirSync(KEYS_DIR, { recursive: true });
}

function keyFileBase(keyId: string): string {
  return keyId.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function makeDefaultRegistryV1(): RegistryV1 {
  const origin = "default";
  const keyId = `${origin}#ed25519-1`;
  const now = Date.now();

  return {
    version: REGISTRY_VERSION,
    activeKeyId: keyId,
    keys: {
      [keyId]: {
        origin,
        alg: "ed25519",
        pubPath: toManagedPath("keys", "ed25519.pub.pem"),
        privPath: toManagedPath("keys", "ed25519.priv.pem"),
        status: "active",
        createdAt: now,
        notBefore: now,
      },
    },
  };
}

function isRegistryV1(obj: any): obj is RegistryV1 {
  return (
    obj &&
    obj.version === REGISTRY_VERSION &&
    typeof obj.activeKeyId === "string" &&
    obj.keys &&
    typeof obj.keys === "object"
  );
}

function isLegacyRegistry(obj: any): obj is LegacyRegistry {
  return (
    obj &&
    typeof obj.active === "string" &&
    obj.keys &&
    typeof obj.keys === "object"
  );
}

function normalizeLegacyRegistry(legacy: LegacyRegistry): RegistryV1 {
  const now = Date.now();
  const keys: Record<string, RegistryKey> = {};

  for (const [keyId, key] of Object.entries(legacy.keys)) {
    keys[keyId] = {
      origin: key.origin,
      alg: key.alg,
      pubPath: key.pubPath.startsWith("data/") ? key.pubPath.slice("data/".length) : key.pubPath,
      privPath: toManagedPath("keys", "ed25519.priv.pem"),
      status: keyId === legacy.active ? "active" : "retired",
      createdAt: now,
      notBefore: now,
    };
  }

  return {
    version: REGISTRY_VERSION,
    activeKeyId: legacy.active,
    keys,
  };
}

function saveRegistry(registry: RegistryV1) {
  fs.writeFileSync(REG_PATH, JSON.stringify(registry, null, 2) + "\n", "utf8");
}

function loadRegistry(): RegistryV1 {
  ensureKeysDir();

  if (!fs.existsSync(REG_PATH)) {
    const reg = makeDefaultRegistryV1();
    saveRegistry(reg);
    return reg;
  }

  const raw = JSON.parse(fs.readFileSync(REG_PATH, "utf8"));

  if (isRegistryV1(raw)) {
    let changed = false;
    for (const entry of Object.values(raw.keys)) {
      if (!entry.privPath) {
        entry.privPath = toManagedPath("keys", "ed25519.priv.pem");
        changed = true;
      }
      if (entry.pubPath.startsWith("data/")) {
        entry.pubPath = entry.pubPath.slice("data/".length);
        changed = true;
      }
      if (entry.privPath.startsWith("data/")) {
        entry.privPath = entry.privPath.slice("data/".length);
        changed = true;
      }
    }
    if (changed) saveRegistry(raw);
    return raw;
  }

  if (isLegacyRegistry(raw)) {
    const migrated = normalizeLegacyRegistry(raw);
    saveRegistry(migrated);
    return migrated;
  }

  throw new Error(`Unsupported registry format at ${REG_PATH}`);
}

export function saveRegistryV1(reg: RegistryV1) {
  saveRegistry(reg);
}

export function loadRegistryV1(): RegistryV1 {
  return loadRegistry();
}

export function getRegistryKeyMeta(keyId: string): RegistryKey {
  const reg = loadRegistry();
  const entry = reg.keys[keyId];
  if (!entry) throw new Error(`Unknown keyId: ${keyId}`);
  return entry;
}

function ensureRegistry() {
  loadRegistry();
}

export function getActiveKeyId(): string {
  const reg = loadRegistry();
  return reg.activeKeyId;
}

export function getPublicKeyPemForKeyId(keyId: string): string {
  const reg = loadRegistry();
  const entry = reg.keys[keyId];
  if (!entry) throw new Error(`Unknown keyId: ${keyId}`);
  const pubAbs = resolveManagedPath(entry.pubPath);
  return fs.readFileSync(pubAbs, "utf8");
}

function ensureKeypairAt(privPathAbs: string, pubPathAbs: string) {
  const privExists = fs.existsSync(privPathAbs);
  const pubExists = fs.existsSync(pubPathAbs);
  if (privExists && pubExists) return;

  const { privateKey, publicKey } = generateKeyPairSync("ed25519");

  fs.writeFileSync(privPathAbs, privateKey.export({ format: "pem", type: "pkcs8" }) as string, "utf8");
  fs.writeFileSync(pubPathAbs, publicKey.export({ format: "pem", type: "spki" }) as string, "utf8");
}

/**
 * Generate a default Ed25519 keypair if it does not exist yet.
 * Kept for compatibility with legacy scripts/fixtures.
 */
export function ensureEd25519Keypair() {
  ensureKeysDir();
  ensureKeypairAt(LEGACY_PRIV_PATH, LEGACY_PUB_PATH);
}

function ensureActiveKeypair() {
  ensureRegistry();
  const reg = loadRegistry();
  const active = reg.keys[reg.activeKeyId];
  if (!active) throw new Error(`Active key missing in registry: ${reg.activeKeyId}`);

  const privAbs = resolveManagedPath(active.privPath ?? toManagedPath("keys", "ed25519.priv.pem"));
  const pubAbs = resolveManagedPath(active.pubPath);
  ensureKeypairAt(privAbs, pubAbs);
}

export function rotateActiveKey(originArg?: string): { oldKeyId: string; newKeyId: string; rotatedAt: number } {
  ensureRegistry();
  const reg = loadRegistry();
  const oldKeyId = reg.activeKeyId;
  const oldKey = reg.keys[oldKeyId];
  if (!oldKey) throw new Error(`Active key missing in registry: ${oldKeyId}`);

  const origin = originArg ?? oldKey.origin;

  const suffixes = Object.keys(reg.keys)
    .filter((id) => id.startsWith(`${origin}#ed25519-`))
    .map((id) => Number(id.split("-").pop()))
    .filter((n) => Number.isFinite(n));

  const nextN = (suffixes.length ? Math.max(...suffixes) : 0) + 1;
  const newKeyId = `${origin}#ed25519-${nextN}`;
  const now = Date.now();

  const base = keyFileBase(newKeyId);
  const pubPath = toManagedPath("keys", `${base}.pub.pem`);
  const privPath = toManagedPath("keys", `${base}.priv.pem`);

  ensureKeypairAt(resolveManagedPath(privPath), resolveManagedPath(pubPath));

  oldKey.status = "retired";
  oldKey.notAfter = now;
  oldKey.reason = `rotated-to:${newKeyId}`;

  reg.keys[newKeyId] = {
    origin,
    alg: "ed25519",
    pubPath,
    privPath,
    status: "active",
    createdAt: now,
    notBefore: now,
    replaces: oldKeyId,
  };

  reg.activeKeyId = newKeyId;
  saveRegistry(reg);

  return { oldKeyId, newKeyId, rotatedAt: now };
}

export function signBase64(message: string): string {
  ensureActiveKeypair();
  const reg = loadRegistry();
  const active = reg.keys[reg.activeKeyId];
  if (!active) throw new Error(`Active key missing in registry: ${reg.activeKeyId}`);

  const privateKeyPem = fs.readFileSync(resolveManagedPath(active.privPath ?? toManagedPath("keys", "ed25519.priv.pem")), "utf8");
  const sig = sign(null, Buffer.from(message, "utf8"), privateKeyPem);
  return sig.toString("base64");
}

export function verifyBase64(message: string, signatureB64: string): boolean {
  ensureEd25519Keypair();
  ensureRegistry();
  const publicKeyPem = fs.readFileSync(LEGACY_PUB_PATH, "utf8");
  return verify(null, Buffer.from(message, "utf8"), publicKeyPem, Buffer.from(signatureB64, "base64"));
}

export function verifyBase64WithPublicKey(message: string, signatureB64: string, publicKeyPem: string): boolean {
  return verify(null, Buffer.from(message, "utf8"), publicKeyPem, Buffer.from(signatureB64, "base64"));
}
