import * as fs from "fs";
import * as path from "path";
import { generateKeyPairSync, sign, verify } from "crypto";

const DATA_DIR = path.resolve(process.cwd(), "data");
const KEYS_DIR = path.join(DATA_DIR, "keys");

// Minimal key file layout for the POC (can be upgraded later).
const PRIV_PATH = path.join(KEYS_DIR, "ed25519.priv.pem");
const PUB_PATH = path.join(KEYS_DIR, "ed25519.pub.pem");

const REG_PATH = path.join(KEYS_DIR, "registry.json");
const REGISTRY_VERSION = "0.1";

export type KeyStatus = "active" | "retired" | "revoked";

export type RegistryKey = {
  origin: string;
  alg: "ed25519";
  pubPath: string;
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
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(KEYS_DIR)) fs.mkdirSync(KEYS_DIR, { recursive: true });
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
        pubPath: "data/keys/ed25519.pub.pem",
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
      pubPath: key.pubPath,
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
    return raw;
  }

  if (isLegacyRegistry(raw)) {
    const migrated = normalizeLegacyRegistry(raw);
    saveRegistry(migrated);
    return migrated;
  }

  throw new Error(`Unsupported registry format at ${REG_PATH}`);
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
  const pubAbs = path.resolve(process.cwd(), entry.pubPath);
  return fs.readFileSync(pubAbs, "utf8");
}

/**
 * Generate an Ed25519 keypair if it does not exist yet.
 * Local storage for POC usage. Key lifecycle (keyId/rotation) can evolve later.
 */
export function ensureEd25519Keypair() {
  ensureKeysDir();

  const privExists = fs.existsSync(PRIV_PATH);
  const pubExists = fs.existsSync(PUB_PATH);
  if (privExists && pubExists) return;

  const { privateKey, publicKey } = generateKeyPairSync("ed25519");

  fs.writeFileSync(PRIV_PATH, privateKey.export({ format: "pem", type: "pkcs8" }) as string, "utf8");
  fs.writeFileSync(PUB_PATH, publicKey.export({ format: "pem", type: "spki" }) as string, "utf8");
}

export function signBase64(message: string): string {
  ensureEd25519Keypair();
  ensureRegistry();
  const privateKeyPem = fs.readFileSync(PRIV_PATH, "utf8");
  const sig = sign(null, Buffer.from(message, "utf8"), privateKeyPem);
  return sig.toString("base64");
}

export function verifyBase64(message: string, signatureB64: string): boolean {
  ensureEd25519Keypair();
  ensureRegistry();
  const publicKeyPem = fs.readFileSync(PUB_PATH, "utf8");
  return verify(null, Buffer.from(message, "utf8"), publicKeyPem, Buffer.from(signatureB64, "base64"));
}

export function verifyBase64WithPublicKey(message: string, signatureB64: string, publicKeyPem: string): boolean {
  return verify(null, Buffer.from(message, "utf8"), publicKeyPem, Buffer.from(signatureB64, "base64"));
}
